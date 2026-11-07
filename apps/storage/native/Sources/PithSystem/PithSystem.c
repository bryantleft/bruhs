#include "PithSystem.h"
#include <libproc.h>
#include <mach/mach.h>
#include <sys/resource.h>
#include <sys/sysctl.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <net/if.h>
#include <net/route.h>
#include <sys/socket.h>

pith_capture pith_read(void) {
    pith_capture result = {0};
    natural_t cores = 0;
    processor_info_array_t ticks = NULL;
    mach_msg_type_number_t tick_count = 0;
    host_t host = mach_host_self();
    if (host_processor_info(host, PROCESSOR_CPU_LOAD_INFO, &cores, &ticks, &tick_count) == KERN_SUCCESS) {
        result.cpu_count = cores < PITH_MAX_CPUS ? (int)cores : PITH_MAX_CPUS;
        for (natural_t c = 0; c < cores; c++) {
            for (int state = 0; state < CPU_STATE_MAX; state++) {
                uint64_t value = (uint32_t)ticks[c * CPU_STATE_MAX + state];
                result.total_ticks += value;
                if (c < PITH_MAX_CPUS) result.cpu_total[c] += value;
                if (state != CPU_STATE_IDLE) {
                    result.busy_ticks += value;
                    if (c < PITH_MAX_CPUS) result.cpu_busy[c] += value;
                }
            }
        }
        result.cpu_valid = 1;
        vm_deallocate(mach_task_self(), (vm_address_t)ticks, tick_count * sizeof(integer_t));
    }
    // Memory composition as Activity Monitor reads it: under a microsecond (measured on macOS 26.3, M2 Max).
    vm_statistics64_data_t vm = {0};
    mach_msg_type_number_t vm_count = HOST_VM_INFO64_COUNT;
    vm_size_t page = 0;
    size_t size = sizeof(result.physical);
    if (host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&vm, &vm_count) == KERN_SUCCESS
        && host_page_size(host, &page) == KERN_SUCCESS
        && sysctlbyname("hw.memsize", &result.physical, &size, NULL, 0) == 0) {
        result.memory_valid = 1;
        result.page_size = page;
        result.free_pages = vm.free_count;
        result.active = vm.active_count;
        result.inactive = vm.inactive_count;
        result.speculative = vm.speculative_count;
        result.wired = vm.wire_count;
        result.compressed = vm.compressor_page_count;
        result.purgeable = vm.purgeable_count;
        result.external = vm.external_page_count;
    }
    mach_port_deallocate(mach_task_self(), host);
    struct xsw_usage swap = {0};
    size = sizeof(swap);
    if (sysctlbyname("vm.swapusage", &swap, &size, NULL, 0) == 0) {
        result.swap_valid = 1;
        result.swap_total = swap.xsu_total;
        result.swap_used = swap.xsu_used;
    }
    size = sizeof(result.pressure);
    if (sysctlbyname("kern.memorystatus_vm_pressure_level", &result.pressure, &size, NULL, 0) != 0) result.pressure = 0;
    // NET_RT_IFLIST2 gives each interface's 64-bit byte counters: 31 µs for all of them on the development Mac.
    int mib[] = {CTL_NET, PF_ROUTE, 0, 0, NET_RT_IFLIST2, 0};
    size_t list = 0;
    if (sysctl(mib, 6, NULL, &list, NULL, 0) == 0 && list > 0) {
        char *buffer = malloc(list);
        if (buffer && sysctl(mib, 6, buffer, &list, NULL, 0) == 0) {
            result.network_valid = 1;
            for (char *next = buffer; next + sizeof(struct if_msghdr) <= buffer + list;) {
                struct if_msghdr *header = (struct if_msghdr *)next;
                if (header->ifm_msglen == 0) break;
                if (header->ifm_type == RTM_IFINFO2) {
                    struct if_msghdr2 *interface = (struct if_msghdr2 *)header;
                    if (!(interface->ifm_flags & IFF_LOOPBACK)) {
                        result.network_in += interface->ifm_data.ifi_ibytes;
                        result.network_out += interface->ifm_data.ifi_obytes;
                    }
                }
                next += header->ifm_msglen;
            }
        }
        free(buffer);
    }

    int capacity = 0;
    size = sizeof(capacity);
    if (sysctlbyname("kern.maxproc", &capacity, &size, NULL, 0) != 0 || capacity <= 0) {
        result.error_code = errno ? errno : EINVAL;
        return result;
    }
    pid_t *pids = calloc((size_t)capacity, sizeof(pid_t));
    result.processes = calloc((size_t)capacity, sizeof(pith_process));
    if (!pids || !result.processes) {
        free(pids); free(result.processes); result.processes = NULL;
        result.error_code = ENOMEM;
        return result;
    }
    int count = proc_listallpids(pids, capacity * (int)sizeof(pid_t));
    mach_timebase_info_data_t timebase;
    mach_timebase_info(&timebase);
    if (count < 0 || count >= capacity) result.error_code = count < 0 ? errno : EOVERFLOW;
    for (int i = 0; i < count && i < capacity; i++) {
        if (pids[i] < 0) continue;
        struct proc_bsdinfo bsd = {0};
        if (proc_pidinfo(pids[i], PROC_PIDTBSDINFO, 0, &bsd, sizeof(bsd)) != sizeof(bsd)) {
            if (errno == EPERM || errno == EACCES) result.unavailable_processes++;
            continue;
        }
        pith_process *p = &result.processes[result.count++];
        // A process dropped below gives its slot to the next one; start clean so no field outlives it.
        memset(p, 0, sizeof *p);
        p->pid = pids[i]; p->parent_pid = (int32_t)bsd.pbi_ppid;
        p->started_us = bsd.pbi_start_tvsec * 1000000 + bsd.pbi_start_tvusec;
        strlcpy(p->name, bsd.pbi_name[0] ? bsd.pbi_name : bsd.pbi_comm, sizeof(p->name));
        proc_pidpath(p->pid, p->path, sizeof(p->path));
        // Version 6 adds the energy counter at about the cost of version 2: 0.4 µs against 0.3 µs per process.
        struct rusage_info_v6 usage = {0};
        if (proc_pid_rusage(p->pid, RUSAGE_INFO_V6, (rusage_info_t *)&usage) == 0) {
            p->readable = 1;
            // libproc CPU time uses Mach absolute units on this macOS API.
            // Convert before exposing a field named cpu_ns to Swift.
            __uint128_t ticks = (__uint128_t)usage.ri_user_time + usage.ri_system_time;
            p->cpu_ns = (uint64_t)(ticks * timebase.numer / timebase.denom);
            p->footprint = usage.ri_phys_footprint;
            p->read_bytes = usage.ri_diskio_bytesread;
            p->written_bytes = usage.ri_diskio_byteswritten;
            p->energy_nj = usage.ri_energy_nj;
            p->energy_valid = 1;
        }
        // A PID can be reused between metadata and counter reads.
        struct proc_bsdinfo after = {0};
        if (proc_pidinfo(p->pid, PROC_PIDTBSDINFO, 0, &after, sizeof(after)) != sizeof(after)
            || after.pbi_start_tvsec != bsd.pbi_start_tvsec || after.pbi_start_tvusec != bsd.pbi_start_tvusec) result.count--;
    }
    free(pids);
    return result;
}

void pith_free(pith_capture capture) { free(capture.processes); }

uint64_t pith_start_time(int32_t pid) {
    struct proc_bsdinfo info = {0};
    if (pid <= 0 || proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info)) return 0;
    return info.pbi_start_tvsec * 1000000 + info.pbi_start_tvusec;
}

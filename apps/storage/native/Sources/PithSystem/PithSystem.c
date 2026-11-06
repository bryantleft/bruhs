#include "PithSystem.h"
#include <libproc.h>
#include <mach/mach.h>
#include <sys/resource.h>
#include <sys/sysctl.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

pith_capture pith_read(void) {
    pith_capture result = {0};
    natural_t cores = 0;
    processor_info_array_t ticks = NULL;
    mach_msg_type_number_t tick_count = 0;
    host_t host = mach_host_self();
    if (host_processor_info(host, PROCESSOR_CPU_LOAD_INFO, &cores, &ticks, &tick_count) == KERN_SUCCESS) {
        for (natural_t c = 0; c < cores; c++) {
            for (int state = 0; state < CPU_STATE_MAX; state++) {
                uint64_t value = (uint32_t)ticks[c * CPU_STATE_MAX + state];
                result.total_ticks += value;
                if (state != CPU_STATE_IDLE) result.busy_ticks += value;
            }
        }
        result.cpu_valid = 1;
        vm_deallocate(mach_task_self(), (vm_address_t)ticks, tick_count * sizeof(integer_t));
    }
    mach_port_deallocate(mach_task_self(), host);
    size_t size = sizeof(result.pressure);
    if (sysctlbyname("kern.memorystatus_vm_pressure_level", &result.pressure, &size, NULL, 0) != 0) result.pressure = 0;

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
        struct rusage_info_v2 usage = {0};
        if (proc_pid_rusage(p->pid, RUSAGE_INFO_V2, (rusage_info_t *)&usage) == 0) {
            p->readable = 1;
            // libproc CPU time uses Mach absolute units on this macOS API.
            // Convert before exposing a field named cpu_ns to Swift.
            __uint128_t ticks = (__uint128_t)usage.ri_user_time + usage.ri_system_time;
            p->cpu_ns = (uint64_t)(ticks * timebase.numer / timebase.denom);
            p->footprint = usage.ri_phys_footprint;
            p->read_bytes = usage.ri_diskio_bytesread;
            p->written_bytes = usage.ri_diskio_byteswritten;
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

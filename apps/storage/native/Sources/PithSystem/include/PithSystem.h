#ifndef PITH_SYSTEM_H
#define PITH_SYSTEM_H
#include <stdint.h>
#include <sys/param.h>

/// Logical CPUs whose ticks a capture keeps one by one. Apple's largest Macs have 32.
#define PITH_MAX_CPUS 128

typedef struct {
    int32_t pid, parent_pid;
    uint64_t started_us, cpu_ns, footprint, read_bytes, written_bytes;
    /// Energy the process has used, in nanojoules (rusage v6). Valid when `energy_valid` is set.
    uint64_t energy_nj;
    int readable, energy_valid;
    char path[4 * MAXPATHLEN];
    char name[64];
} pith_process;

typedef struct {
    uint64_t busy_ticks, total_ticks;
    int cpu_valid, pressure, error_code, unavailable_processes;
    int count;
    pith_process *processes;
    /// Each logical CPU's ticks, numbered as macOS numbers them: the lowest-capability tier first.
    int cpu_count;
    uint64_t cpu_busy[PITH_MAX_CPUS], cpu_total[PITH_MAX_CPUS];
    /// host_statistics64 page counts, the page size and physical memory, when `memory_valid`.
    int memory_valid;
    uint64_t physical, page_size, free_pages, active, inactive, speculative, wired, compressed, purgeable, external;
    /// vm.swapusage, when `swap_valid`.
    int swap_valid;
    uint64_t swap_total, swap_used;
    /// Bytes received and sent by every interface but loopback since boot (64-bit counters), when `network_valid`.
    int network_valid;
    uint64_t network_in, network_out;
} pith_capture;

pith_capture pith_read(void);
void pith_free(pith_capture capture);

/// A process's start time in microseconds since 1970, or 0 when it's gone or unreadable. Checked again just before a
/// signal, since macOS has no way to signal a process by identity and PIDs are reused.
uint64_t pith_start_time(int32_t pid);
#endif

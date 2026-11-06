#ifndef PITH_SYSTEM_H
#define PITH_SYSTEM_H
#include <stdint.h>
#include <sys/param.h>

typedef struct {
    int32_t pid, parent_pid;
    uint64_t started_us, cpu_ns, footprint, read_bytes, written_bytes;
    int readable;
    char path[4 * MAXPATHLEN];
    char name[64];
} pith_process;

typedef struct {
    uint64_t busy_ticks, total_ticks;
    int cpu_valid, pressure, error_code, unavailable_processes;
    int count;
    pith_process *processes;
} pith_capture;

pith_capture pith_read(void);
void pith_free(pith_capture capture);
#endif

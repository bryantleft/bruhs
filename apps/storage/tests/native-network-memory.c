// Exercise the production C ownership paths without depending on macOS's private network framework.
#ifndef PITH_SYSTEM_SOURCE
#define PITH_SYSTEM_SOURCE "../native/Sources/PithSystem/PithSystem.c"
#endif
#include PITH_SYSTEM_SOURCE
#include <assert.h>
#include <stdio.h>

static dispatch_group_t pending;
static int delayed;
static unsigned completions, delayed_completions;

static void describe(pith_nstat_manager manager, void (^completion)(void)) {
    (void)manager;
    completion();
}

static void counts(pith_nstat_manager manager, void (^completion)(void)) {
    (void)manager;
    const int late = delayed;
    dispatch_group_enter(pending);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, late ? 10 * NSEC_PER_MSEC : 0), net.queue, ^{
        completion();
        completions++;
        if (late) delayed_completions++;
        dispatch_group_leave(pending);
    });
}

int main(int argc, char **argv) {
    pending = dispatch_group_create();
    net.queue = dispatch_queue_create("app.bruhs.pith.network-memory-test", DISPATCH_QUEUE_SERIAL);
    net.received = calloc(PITH_NET_PIDS, sizeof(uint64_t));
    net.sent = calloc(PITH_NET_PIDS, sizeof(uint64_t));
    assert(net.received && net.sent);
    net.state = 1;
    net.query_descriptions = describe;
    net.query_all = counts;
    pith_net_total result = {0};
    for (unsigned i = 0; i < 1000; i++) {
        assert(pith_net_totals(&result, 1, NSEC_PER_SEC) == 0);
    }
    delayed = 1;
    for (unsigned i = 0; i < 1000; i++) {
        assert(pith_net_totals(&result, 1, 0) == 0);
    }
    // A zero wait can return before the queue starts a query, so enqueue the barrier before waiting on its group.
    dispatch_sync(net.queue, ^{});
    dispatch_group_wait(pending, DISPATCH_TIME_FOREVER);
    dispatch_sync(net.queue, ^{});
    assert(completions >= 1000 && delayed_completions > 0);
    assert(!net.querying);
    free(net.received); free(net.sent);
    net.received = NULL; net.sent = NULL;
    dispatch_release(pending);
    dispatch_release(net.queue);
    printf("Network ownership: 2000 calls, completed and overlapping timed-out queries verified.\n");
    fflush(stdout);
    if (argc > 1 && strcmp(argv[1], "--hold") == 0) getchar();
    return 0;
}

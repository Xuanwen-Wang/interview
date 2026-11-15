#!/usr/bin/env python3
"""Exhaust finite teaching models, not vendor hardware or compiler execution."""

from collections import deque


def explore_pair(policy):
    """P writes A then B; C reads B then A, preserving each actor's order."""
    initial = (0, 0, 0, 0, 0)
    pending = deque([(initial, ())])
    seen = {initial}
    violations = []
    finals = []
    while pending:
        state, trace = pending.popleft()
        producer, consumer, tokens, flags, written = state
        if producer == consumer == 2:
            finals.append(state)
        successors = []
        if producer < 2:
            bit = 1 << producer
            send = policy == 'anonymous' or (policy == 'coalesced' and producer == 1)
            next_flags = flags | bit if policy == 'named' else flags
            successors.append(((producer + 1, consumer, tokens + int(send),
                                next_flags, written | bit), f'P{producer + 1}'))
        if consumer < 2:
            needed = 1 << (1 - consumer)
            recv = policy == 'anonymous' or (policy == 'coalesced' and consumer == 0)
            enabled = (tokens > 0 if recv else True)
            if policy == 'named':
                enabled = bool(flags & needed)
            if enabled:
                if not written & needed:
                    violations.append(trace + (f'C{consumer + 1}: premature read',))
                next_flags = flags & ~needed if policy == 'named' else flags
                successors.append(((producer, consumer + 1, tokens - int(recv),
                                    next_flags, written), f'C{consumer + 1}'))
        for successor, action in successors:
            if successor not in seen:
                seen.add(successor)
                pending.append((successor, trace + (action,)))
    assert finals and all(s[2] == s[3] == 0 for s in finals)
    return violations, len(seen)


def capacity_model(capacity, notification_count):
    """P sends N tokens to C, then one to R; C waits for R before draining P."""
    # State: P outbox index, P->C tokens, P->R flag, R->C flag, C started, drained.
    initial = (0, 0, 0, 0, False, 0)
    pending = deque([initial])
    seen = {initial}
    deadlocks = []
    completed = []
    while pending:
        state = pending.popleft()
        p, pc, pr, rc, started, drained = state
        if p == notification_count + 1 and drained == notification_count:
            completed.append(state)
            continue
        successors = []
        if p < notification_count and pc < capacity:
            successors.append((p + 1, pc + 1, pr, rc, started, drained))
        elif p == notification_count:
            successors.append((p + 1, pc, 1, rc, started, drained))
        if pr:
            successors.append((p, pc, 0, 1, started, drained))
        if rc and not started:
            successors.append((p, pc, pr, 0, True, drained))
        if started and pc:
            successors.append((p, pc - 1, pr, rc, started, drained + 1))
        if not successors:
            deadlocks.append(state)
        for successor in successors:
            if successor not in seen:
                seen.add(successor)
                pending.append(successor)
    return deadlocks, completed


def check_frontiers():
    order = [('P1', 'P'), ('P2', 'P'), ('C0', 'C'), ('C1', 'C')]
    required = {('P1', 'C1')}
    cuts_covering_required = []
    for cut in range(len(order) + 1):
        producers = [name for name, pipe in order[:cut] if pipe == 'P']
        consumers = [name for name, pipe in order[cut:] if pipe == 'C']
        edges = {(p, c) for p in producers for c in consumers}
        if required <= edges:
            cuts_covering_required.append(cut)
            assert edges - required, (cut, edges)
    assert cuts_covering_required == [1, 2, 3]


def main():
    unsafe, anonymous_states = explore_pair('anonymous')
    assert ('P1', 'C1: premature read') in unsafe
    for policy in ('coalesced', 'named'):
        failures, states = explore_pair(policy)
        assert not failures, (policy, failures)
        print(f'PASS: {policy}, all {states} reachable states preserve buffer readiness')
    check_frontiers()
    for capacity in range(1, 5):
        deadlocks, completed = capacity_model(capacity, capacity + 1)
        assert deadlocks and not completed
        deadlocks, completed = capacity_model(capacity + 1, capacity + 1)
        assert completed and not deadlocks
    print(f'PASS: anonymous counterexample in {anonymous_states} reachable states')
    print('PASS: every covering single cut adds an edge under the fixed schedule')
    print('PASS: bounded-channel deadlocks and increased-capacity controls, B=1..4')
    print('Scope: finite semantic teaching models; no claim about hardware timing')


if __name__ == '__main__':
    main()

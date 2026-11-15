#!/usr/bin/env python3
"""Exhaust finite teaching models, not vendor hardware or compiler execution."""

from collections import deque
import base64
import json
from pathlib import Path
import re

from build import ContentCheck


def check_event_reuse(handshake):
    """Explore two independent queues; a second Set on a full bit is illegal."""
    p_ops = ('set_a', 'wait_ack', 'set_b') if handshake else ('set_a', 'set_b')
    q_ops = ('wait_a', 'set_ack', 'wait_b') if handshake else ('wait_a', 'wait_b')
    initial = (0, 0, 0, 0)
    todo = deque([(initial, ())])
    seen, bad, finished = {initial}, [], []
    while todo:
        (p, q, ready, ack), trace = todo.popleft()
        if p == len(p_ops) and q == len(q_ops):
            finished.append((ready, ack))
        successors = []
        if p < len(p_ops):
            op = p_ops[p]
            if op.startswith('set'):
                if ready:
                    bad.append(trace + (op,))
                else:
                    successors.append(((p + 1, q, 1, ack), op))
            elif ack:
                successors.append(((p + 1, q, ready, 0), op))
        if q < len(q_ops):
            op = q_ops[q]
            if op == 'set_ack':
                assert not ack
                successors.append(((p, q + 1, ready, 1), op))
            elif ready:
                successors.append(((p, q + 1, 0, ack), op))
        for state, action in successors:
            if state not in seen:
                seen.add(state)
                todo.append((state, trace + (action,)))
        assert successors or bad or (p == len(p_ops) and q == len(q_ops))
    assert finished and all(state == (0, 0) for state in finished)
    return bad


def closure(edges):
    result = set(edges)
    while True:
        larger = result | {(a, d) for a, b in result for c, d in result if b == c}
        if larger == result:
            return result
        result = larger


def check_cut_and_reordering():
    """Compare implied partial orders, not just the count of explicit edges."""
    required = {('P1', 'C1')}
    for order, should_have_exact_cut in [
        (['P1', 'P2', 'C0', 'C1'], False),
        (['P1', 'C1', 'P2', 'C0'], True),
    ]:
        intrinsic = {(a, b) for i, a in enumerate(order) for b in order[i + 1:]
                     if a[0] == b[0]}
        ideal = closure(intrinsic | required)
        valid, exact = [], []
        for cut in range(len(order) + 1):
            introduced = {(a, b) for a in order[:cut] for b in order[cut:]
                          if a.startswith('P') and b.startswith('C')}
            actual = closure(intrinsic | introduced)
            if required <= actual:
                valid.append(cut)
                if actual == ideal:
                    exact.append(cut)
        assert valid
        assert bool(exact) == should_have_exact_cut, (order, exact)


def check_three_stage_barriers(use_barriers):
    """Atomically complete operations in each stream; verify tile versions."""
    # Four tiles, two distinct input slots and two distinct output slots.
    io = [('L', 0, 0), ('L', 1, 1), ('S', 0, 2), ('L', 2, 2),
          ('S', 1, 3), ('L', 3, 3), ('S', 2, 4), ('S', 3, 5)]
    compute = [('C', i, i + 1) for i in range(4)]
    initial = (0, 0, (-1, -1), (-1, -1))
    todo, seen, bad, finals = deque([initial]), {initial}, [], []
    while todo:
        state = todo.popleft()
        ip, cp, inputs, outputs = state
        if ip == len(io) and cp == len(compute):
            finals.append(state)
            continue
        next_ops = []
        if ip < len(io):
            next_ops.append((0, io[ip]))
        if cp < len(compute):
            next_ops.append((1, compute[cp]))
        min_stage = min(op[2] for _, op in next_ops)
        for stream, (kind, tile, stage) in next_ops:
            if use_barriers and stage != min_stage:
                continue
            slot = tile % 2
            if kind == 'C' and inputs[slot] != tile:
                bad.append((kind, tile, inputs[slot]))
                continue
            if kind == 'S' and outputs[slot] != tile:
                bad.append((kind, tile, outputs[slot]))
                continue
            new_input, new_output = list(inputs), list(outputs)
            if kind == 'L':
                new_input[slot] = tile
            if kind == 'C':
                new_output[slot] = tile
            successor = (ip + (stream == 0), cp + (stream == 1),
                         tuple(new_input), tuple(new_output))
            if successor not in seen:
                seen.add(successor)
                todo.append(successor)
    assert finals
    return bad


def check_aggregated_rounds():
    """AIC may consume a round only when both AIV participants completed it."""
    todo, seen, finished = deque([(0, 0, 0)]), {(0, 0, 0)}, False
    while todo:
        n0, n1, consumed = todo.popleft()
        assert consumed <= min(n0, n1)
        if (n0, n1, consumed) == (2, 2, 2):
            finished = True
        successors = []
        if n0 < 2:
            successors.append((n0 + 1, n1, consumed))
        if n1 < 2:
            successors.append((n0, n1 + 1, consumed))
        if n0 > consumed and n1 > consumed:
            successors.append((n0, n1, consumed + 1))
        for state in successors:
            if state not in seen:
                seen.add(state)
                todo.append(state)
    assert finished and (1, 0, 0) in seen and (1, 0, 1) not in seen
    # Summing individual arrivals would incorrectly permit this consumption.
    assert sum((1, 0)) > 0 and min(1, 0) == 0


def check_embedded_figures():
    """Keep original raster figures offline without admitting active data URLs."""
    path = Path(__file__).resolve().parents[1] / 'content/42-domestic-chip-dependency.json'
    chapter = json.loads(path.read_text())[0]
    figures = []
    for section in chapter['sections']:
        ContentCheck().feed(section['html'])
        figures.extend(re.findall(r'href="(data:image/png;base64,[^"]+)"', section['html']))
    assert len(figures) == 4
    for encoded in figures:
        assert base64.b64decode(encoded.split(',')[1], validate=True).startswith(b'\x89PNG\r\n\x1a\n')
    unsafe = [
        '<image href="data:image/svg+xml;base64,PHN2Zz4=">',
        '<a href="data:image/png;base64,iVBORw0KGgo=">bad</a>',
        '<image href="javascript:alert(1)">',
        '<image href="data:image/png;base64,AAAA">',
        '<image href="data:image/png;base64,%%%">',
        '<image href="'+figures[0]+'" onload="alert(1)">',
    ]
    for html in unsafe:
        try:
            ContentCheck().feed(html)
        except ValueError:
            continue
        raise AssertionError('Active or invalid content unexpectedly accepted')


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
    assert ('set_a', 'set_b') in check_event_reuse(False)
    assert not check_event_reuse(True)
    check_cut_and_reordering()
    assert not check_three_stage_barriers(True)
    assert check_three_stage_barriers(False)
    check_aggregated_rounds()
    check_embedded_figures()
    print('PASS: bit-event reuse counterexample and reverse-handshake control')
    print('PASS: cut coverage changes under legal instruction reordering')
    print('PASS: two-slot pipeline tile versions, with/without phase barriers')
    print('PASS: two-participant aggregated rounds and embedded PNG restrictions')
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

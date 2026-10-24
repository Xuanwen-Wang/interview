"""Original teaching exercises; not a company's take-home solution.

All numeric IR examples use unsigned arithmetic modulo 2**32.
CPU reference operators prioritize explicit contracts over performance.
"""
from collections import deque
from dataclasses import dataclass
import heapq
import math


@dataclass(eq=False)
class Node:
    value: int
    next: object = None


def reverse_k_group(head, k):
    """Reverse complete groups in an acyclic list; preserve a short tail."""
    if k < 1:
        raise ValueError('k must be positive')
    dummy = Node(0, head)
    before = dummy
    while True:
        end = before
        for _ in range(k):
            end = end.next
            if end is None:
                return dummy.next
        after, current = end.next, before.next
        old_head, previous = current, after
        while current is not after:
            following = current.next
            current.next = previous
            previous, current = current, following
        before.next = end
        before = old_head


def heap_sort(values):
    """In-place ascending heapsort, O(n log n) time and O(1) extra space."""
    def down(i, end):
        while 2 * i + 1 < end:
            child = 2 * i + 1
            if child + 1 < end and values[child + 1] > values[child]:
                child += 1
            if values[i] >= values[child]:
                break
            values[i], values[child] = values[child], values[i]
            i = child
    n = len(values)
    for i in range(n // 2 - 1, -1, -1):
        down(i, n)
    for end in range(n - 1, 0, -1):
        values[0], values[end] = values[end], values[0]
        down(0, end)


def topk_indices(values, k):
    """Descending finite scores; ties prefer lower indices. k may be zero."""
    if not 0 <= k <= len(values) or not all(math.isfinite(x) for x in values):
        raise ValueError('invalid k or non-finite score')
    if k == 0:
        return []
    heap = []
    for i, score in enumerate(values):
        item = (score, -i, i)
        if len(heap) < k:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)
    return [i for _, _, i in sorted(heap, key=lambda t: (-t[0], t[2]))]


def kth_smallest(values, k):
    """Zero-based order statistic; copied input and three-way partition."""
    if not 0 <= k < len(values):
        raise ValueError('invalid k')
    a = list(values)
    lo, hi = 0, len(a)
    while True:
        pivot = a[(lo + hi) // 2]
        lower, current, upper = lo, lo, hi
        while current < upper:
            if a[current] < pivot:
                a[lower], a[current] = a[current], a[lower]
                lower += 1
                current += 1
            elif a[current] > pivot:
                upper -= 1
                a[current], a[upper] = a[upper], a[current]
            else:
                current += 1
        if k < lower:
            hi = lower
        elif k >= upper:
            lo = upper
        else:
            return pivot


def topological_order(n, edges):
    """Kahn's algorithm on nodes 0..n-1. Duplicate edges are deduplicated."""
    if n < 0:
        raise ValueError('negative node count')
    successors, degree, seen = [[] for _ in range(n)], [0] * n, set()
    for u, v in edges:
        if not (0 <= u < n and 0 <= v < n):
            raise ValueError('unknown node')
        if (u, v) not in seen:
            seen.add((u, v))
            successors[u].append(v)
            degree[v] += 1
    ready = deque(i for i in range(n) if degree[i] == 0)
    order = []
    while ready:
        u = ready.popleft()
        order.append(u)
        for v in successors[u]:
            degree[v] -= 1
            if degree[v] == 0:
                ready.append(v)
    if len(order) != n:
        raise ValueError('cycle')
    return order


def solve_liveness(successors, uses, definitions, edge_uses=None):
    """IN is before block definitions, including phi definitions.

    Exclude phi operands from block uses; supply them on predecessor edges.
    Blocks and their use/definition sets are supplied by the caller.
    """
    edge_uses = edge_uses or {}
    blocks = list(successors)
    if set(uses) != set(blocks) or set(definitions) != set(blocks):
        raise ValueError('missing block sets')
    if any(s not in successors for ss in successors.values() for s in ss):
        raise ValueError('unknown successor')
    if any(a not in successors or b not in successors[a] for a, b in edge_uses):
        raise ValueError('edge use without an edge')
    live_in, live_out = ({b: set() for b in blocks} for _ in range(2))
    while True:
        changed = False
        for b in reversed(blocks):
            out = set()
            for s in successors[b]:
                out |= live_in[s] | set(edge_uses.get((b, s), ()))
            incoming = set(uses[b]) | (out - set(definitions[b]))
            if out != live_out[b] or incoming != live_in[b]:
                live_out[b], live_in[b] = out, incoming
                changed = True
        if not changed:
            return live_in, live_out


def schedule_dag(operations):
    """Toy machine: one slot per engine, latency >= 1, no same-cycle bypass.

    Each operation has engine, latency and dependency indices. Memory edges
    must already be included. No storage allocation is attempted here.
    """
    n = len(operations)
    if any(op['latency'] < 1 or int(op['latency']) != op['latency'] for op in operations):
        raise ValueError('latency must be a positive integer')
    edges = [(d, i) for i, op in enumerate(operations) for d in op['deps']]
    order = topological_order(n, edges)
    successors = [[] for _ in operations]
    for d, i in edges:
        successors[d].append(i)
    height = [0] * n
    for i in reversed(order):
        height[i] = operations[i]['latency'] + max((height[s] for s in successors[i]), default=0)
    start, cycle = {}, 0
    while len(start) < n:
        ready = [i for i, op in enumerate(operations) if i not in start and
                 all(d in start and start[d] + operations[d]['latency'] <= cycle for d in op['deps'])]
        used = set()
        for i in sorted(ready, key=lambda i: (-height[i], i)):
            engine = operations[i]['engine']
            if engine not in used:
                start[i] = cycle
                used.add(engine)
        cycle += 1
    return start


def validate_schedule(operations, start):
    """Independent resource and dependency checker for the toy machine."""
    if set(start) != set(range(len(operations))):
        return False
    occupied = set()
    for i, op in enumerate(operations):
        cycle = start[i]
        if not isinstance(cycle, int) or cycle < 0:
            return False
        resource = (cycle, op['engine'])
        if resource in occupied:
            return False
        occupied.add(resource)
        for d in op['deps']:
            if d not in start or start[d] + operations[d]['latency'] > cycle:
                return False
    return True


def stable_softmax(row, mask=None):
    """Finite active logits; all-masked rows explicitly produce zeros."""
    mask = [True] * len(row) if mask is None else list(mask)
    if len(mask) != len(row):
        raise ValueError('mask shape mismatch')
    active = [x for x, valid in zip(row, mask) if valid]
    if not all(math.isfinite(x) for x in active):
        raise ValueError('active logits must be finite')
    if not active:
        return [0.0] * len(row)
    peak = max(active)
    e = [math.exp(x - peak) if valid else 0.0 for x, valid in zip(row, mask)]
    total = math.fsum(e)
    return [x / total for x in e]


def exclusive_scan(values):
    """Blelloch tree simulated on CPU; zero padding to a power of two."""
    if not values:
        return []
    size = 1 << (len(values) - 1).bit_length()
    work = list(values) + [0] * (size - len(values))
    step = 2
    while step <= size:
        for end in range(step - 1, size, step):
            work[end] += work[end - step // 2]
        step *= 2
    work[-1] = 0
    step = size
    while step >= 2:
        for end in range(step - 1, size, step):
            left = end - step // 2
            work[left], work[end] = work[end], work[end] + work[left]
        step //= 2
    return work[:len(values)]


def conv2d_single(image, kernel, stride=1, padding=0):
    """Single-channel cross correlation, rectangular kernel, no dilation."""
    if not image or not image[0] or not kernel or not kernel[0]:
        raise ValueError('empty tensor')
    h, w, kh, kw = len(image), len(image[0]), len(kernel), len(kernel[0])
    if any(len(row) != w for row in image) or any(len(row) != kw for row in kernel):
        raise ValueError('ragged tensor')
    if not isinstance(stride, int) or stride < 1 or not isinstance(padding, int) or padding < 0:
        raise ValueError('invalid stride or padding')
    oh, ow = (h + 2 * padding - kh) // stride + 1, (w + 2 * padding - kw) // stride + 1
    if oh <= 0 or ow <= 0:
        raise ValueError('non-positive output size')
    out = [[0.0] * ow for _ in range(oh)]
    for y in range(oh):
        for x in range(ow):
            for ky in range(kh):
                for kx in range(kw):
                    iy, ix = y * stride + ky - padding, x * stride + kx - padding
                    if 0 <= iy < h and 0 <= ix < w:
                        out[y][x] += image[iy][ix] * kernel[ky][kx]
    return out


def mean_filter3(image):
    """Zero padding, fixed divisor nine, output has the input shape."""
    return conv2d_single(image, [[1 / 9] * 3 for _ in range(3)], padding=1)


@dataclass(frozen=True)
class Instruction:
    dest: str
    op: str
    args: tuple = ()
    imm: int = 0


PURE_OPS = frozenset({'const', 'add', 'mul'})
MASK32 = (1 << 32) - 1


def optimize(program, outputs):
    """Constant folding and backward DCE on valid straight-line scalar SSA.

    Unknown operations are retained as effectful; all their arguments stay
    live. No memory, CFG, overflow flags, floats or algebraic reassociation.
    """
    folded, constants = [], {}
    for inst in program:
        if inst.op == 'const':
            value = inst.imm & MASK32
        elif inst.op in {'add', 'mul'} and all(a in constants for a in inst.args):
            a, b = (constants[x] for x in inst.args)
            value = (a + b if inst.op == 'add' else a * b) & MASK32
        else:
            folded.append(inst)
            continue
        constants[inst.dest] = value
        folded.append(Instruction(inst.dest, 'const', imm=value))
    live, kept = set(outputs), []
    for inst in reversed(folded):
        if inst.dest in live or inst.op not in PURE_OPS:
            kept.append(inst)
            live.discard(inst.dest)
            live.update(inst.args)
    return list(reversed(kept))


def interpret(program, inputs=None):
    """Reference semantics; 'observe' appends an externally visible value."""
    values, effects = dict(inputs or {}), []
    for inst in program:
        if inst.op == 'const':
            result = inst.imm
        elif inst.op == 'add':
            result = values[inst.args[0]] + values[inst.args[1]]
        elif inst.op == 'mul':
            result = values[inst.args[0]] * values[inst.args[1]]
        elif inst.op == 'observe':
            result = values[inst.args[0]]
            effects.append(result & MASK32)
        else:
            raise ValueError('unknown interpreter operation')
        values[inst.dest] = result & MASK32
    return values, effects

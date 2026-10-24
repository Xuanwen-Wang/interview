"""Boundary, differential and negative checks for original teaching code."""
import math
import random
import unittest
from reference import (Node, reverse_k_group, heap_sort, topk_indices, kth_smallest,
                       topological_order, solve_liveness, schedule_dag,
                       validate_schedule, stable_softmax, exclusive_scan,
                       conv2d_single, mean_filter3, Instruction, optimize, interpret)


class Exercises(unittest.TestCase):
    def test_linked_groups(self):
        for n in range(26):
            for k in range(1, 30):
                nodes = [Node(i) for i in range(n)]
                for a, b in zip(nodes, nodes[1:]):
                    a.next = b
                result = reverse_k_group(nodes[0] if n else None, k)
                actual, identities = [], []
                while result:
                    self.assertLess(len(actual), n)
                    actual.append(result.value)
                    identities.append(id(result))
                    result = result.next
                expected = [x for i in range(0, n, k) for x in
                            (list(reversed(range(i, i + k))) if i + k <= n else range(i, n))]
                self.assertEqual(actual, expected)
                self.assertEqual(set(identities), {id(x) for x in nodes})
        with self.assertRaises(ValueError):
            reverse_k_group(None, 0)

    def test_heap_and_selection(self):
        rng = random.Random(514)
        for n in range(80):
            values = [rng.randrange(-8, 9) for _ in range(n)]
            sorted_values = sorted(values)
            actual = values.copy()
            heap_sort(actual)
            self.assertEqual(actual, sorted_values)
            for k in {0, n // 2, n}:
                self.assertEqual(topk_indices(values, k), sorted(range(n), key=lambda i: (-values[i], i))[:k])
            if n:
                for k in {0, n // 2, n - 1}:
                    self.assertEqual(kth_smallest(values, k), sorted_values[k])
        self.assertEqual(topk_indices([2, 2, 1], 2), [0, 1])
        with self.assertRaises(ValueError):
            topk_indices([float('nan')], 1)

    def test_topology(self):
        rng = random.Random(518)
        for n in range(1, 35):
            edges = [(i, j) for i in range(n) for j in range(i + 1, n) if rng.random() < .15]
            result = topological_order(n, edges + edges[:3])
            self.assertEqual(set(result), set(range(n)))
            pos = {x: i for i, x in enumerate(result)}
            self.assertTrue(all(pos[a] < pos[b] for a, b in edges))
        for n, edges in [(1, [(0, 0)]), (3, [(0, 1), (1, 2), (2, 0)]), (1, [(0, 2)])]:
            with self.assertRaises(ValueError):
                topological_order(n, edges)

    def test_phi_and_loop_liveness(self):
        successors = {'entry': ['left', 'right'], 'left': ['join'], 'right': ['join'], 'join': []}
        uses = {'entry': {'c'}, 'left': {'a'}, 'right': {'b'}, 'join': {'p'}}
        defs = {'entry': set(), 'left': {'x'}, 'right': {'y'}, 'join': set()}
        # p is a live-in external value; q is a phi result defined at join.
        uses['join'] = {'p'}
        defs['join'] = {'q'}
        ins, outs = solve_liveness(successors, uses, defs, {('left', 'join'): {'x'}, ('right', 'join'): {'y'}})
        self.assertEqual(outs['left'], {'p', 'x'})
        self.assertEqual(outs['right'], {'p', 'y'})
        self.assertEqual(ins['entry'], {'a', 'b', 'c', 'p'})
        ins, outs = solve_liveness({'h': ['b', 'exit'], 'b': ['h'], 'exit': []},
                                   {'h': {'i', 'n'}, 'b': {'i', 'x'}, 'exit': {'x'}},
                                   {'h': set(), 'b': {'i', 'x'}, 'exit': set()})
        self.assertEqual(ins['b'], {'i', 'n', 'x'})
        self.assertEqual(outs['b'], {'i', 'n', 'x'})

    def test_schedule_and_rejected_mutations(self):
        rng = random.Random(912)
        for n in range(1, 45):
            ops = [{'engine': rng.choice(['load', 'alu', 'store']), 'latency': rng.randrange(1, 5),
                    'deps': [j for j in range(i) if rng.random() < .12]} for i in range(n)]
            starts = schedule_dag(ops)
            self.assertTrue(validate_schedule(ops, starts))
            # Independent event simulation checks occupied engines and completion.
            finished = set()
            for t in range(max(starts[i] + op['latency'] for i, op in enumerate(ops)) + 1):
                finished |= {i for i, op in enumerate(ops) if starts[i] + op['latency'] == t}
                firing = [i for i in range(n) if starts[i] == t]
                self.assertEqual(len(firing), len({ops[i]['engine'] for i in firing}))
                self.assertTrue(all(set(ops[i]['deps']) <= finished for i in firing))
        ops = [{'engine': 'load', 'latency': 3, 'deps': []}, {'engine': 'alu', 'latency': 1, 'deps': [0]}]
        self.assertFalse(validate_schedule(ops, {0: 0, 1: 1}))
        self.assertFalse(validate_schedule(ops, {0: 0}))

    def test_softmax(self):
        x = [1000, 1001, 999]
        out = stable_softmax(x)
        self.assertAlmostEqual(sum(out), 1)
        for a, b in zip(out, stable_softmax([v - 1000 for v in x])):
            self.assertAlmostEqual(a, b)
        self.assertEqual(stable_softmax([1, 2], [False, False]), [0, 0])
        self.assertEqual(stable_softmax([float('nan'), 4], [False, True]), [0, 1])
        self.assertEqual(stable_softmax([]), [])
        with self.assertRaises(ValueError):
            stable_softmax([float('inf')])

    def test_scan(self):
        rng = random.Random(32)
        for n in range(100):
            values = [rng.randrange(-10, 11) for _ in range(n)]
            self.assertEqual(exclusive_scan(values), [sum(values[:i]) for i in range(n)])

    def test_conv_and_filter(self):
        image = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
        self.assertEqual(conv2d_single(image, [[1, 0], [0, -1]]), [[-4, -4], [-4, -4]])
        self.assertEqual(conv2d_single(image, [[1]], stride=2), [[1, 3], [7, 9]])
        filtered = mean_filter3([[1, 1], [1, 1]])
        for row in filtered:
            for x in row:
                self.assertAlmostEqual(x, 4 / 9)
        with self.assertRaises(ValueError):
            conv2d_single([[1], [1, 2]], [[1]])
        with self.assertRaises(ValueError):
            conv2d_single([[1]], [[1, 1], [1, 1]])

    def test_optimization_equivalence(self):
        rng = random.Random(0x518)
        for _ in range(200):
            program, available = [], ['input']
            for i in range(20):
                name = f'v{i}'
                if rng.random() < .3:
                    inst = Instruction(name, 'const', imm=rng.randrange(-(1 << 33), 1 << 33))
                else:
                    inst = Instruction(name, rng.choice(['add', 'mul']), tuple(rng.choices(available, k=2)))
                program.append(inst)
                available.append(name)
            program.insert(14, Instruction('effect', 'observe', ('v2',)))
            outputs = [available[-1]]
            original, effects = interpret(program, {'input': rng.randrange(1 << 32)})
            # Preserve the identical input in the optimized execution.
            changed, changed_effects = interpret(optimize(program, outputs), {'input': original['input']})
            self.assertEqual([changed[x] for x in outputs], [original[x] for x in outputs])
            self.assertEqual(changed_effects, effects)
            self.assertEqual(optimize(optimize(program, outputs), outputs), optimize(program, outputs))
        unknown = [Instruction('x', 'const', imm=2), Instruction('u', 'unknown', ('x',))]
        self.assertEqual(optimize(unknown, []), unknown)


if __name__ == '__main__':
    unittest.main()

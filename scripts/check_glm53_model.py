#!/usr/bin/env python3
"""Check independent GLM config invariants and the mHC teaching examples.

These are source/config and scalar-model checks, not device execution.
"""
import itertools
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
snapshot = json.loads((ROOT / 'evidence/glm53-config-snapshot.json').read_text())
config = snapshot['text_config']
layers = config['layer_types']
assert len(layers) == config['num_hidden_layers'] == 45
kda = {i for i, kind in enumerate(layers) if kind == 'linear_attention'}
dsa = {i for i, kind in enumerate(layers) if kind == 'deepseek_sparse_attention'}
assert len(kda) == 34 and len(dsa) == 11
assert kda.isdisjoint(dsa) and kda | dsa == set(range(45))
assert dsa == set(range(3, 45, 4))
assert kda == set(config['linear_attn_config']['kda_layers'])
assert dsa == set(config['linear_attn_config']['full_attn_layers'])
assert config['mlp_layer_types'] == ['dense'] * 3 + ['sparse'] * 42
assert config['hidden_size'] == snapshot['vision_config']['out_hidden_size']
assert config['vocab_size'] % 4 == 0
assert config['intermediate_size'] // 4 == 3072
assert config['moe_intermediate_size'] // 4 == 512
assert config['linear_attn_config']['num_heads'] // 4 == 16

# The non-symmetric permutation has a direct stream-ownership oracle.
# C[m,n] sends input m to output n: destination n gets input (n-1) mod 4.
streams = [1.0, 2.0, 4.0, 8.0]
destinations = [1, 2, 3, 0]
matrix = [[float(destinations[m] == n) for n in range(4)] for m in range(4)]
residual = [sum(matrix[m][n] * streams[m] for m in range(4)) for n in range(4)]
assert residual == [8.0, 1.0, 2.0, 4.0]
wrong_direction = [sum(matrix[n][m] * streams[m] for m in range(4)) for n in range(4)]
assert wrong_direction != residual
post = [.5, 1.0, 1.5, 2.0]
output = [r + gate * 2 for r, gate in zip(residual, post)]
assert output == [9.0, 3.0, 5.0, 8.0]
assert sum(output) / 4 == 6.25

# Build doubly stochastic matrices independently as convex mixtures of
# permutations. Test conservation and convex bounds without reimplementing
# the kernel's Sinkhorn normalization.
rng = random.Random(53)
permutations = list(itertools.permutations(range(4)))
for _ in range(100):
    weights = [rng.random() for _ in permutations]
    norm = sum(weights)
    c = [[sum(w for w, perm in zip(weights, permutations) if perm[m] == n) / norm
          for n in range(4)] for m in range(4)]
    x = [rng.uniform(-10, 10) for _ in range(4)]
    y = [sum(c[m][n] * x[m] for m in range(4)) for n in range(4)]
    assert all(math.isclose(sum(row), 1.0) for row in c)
    assert all(math.isclose(sum(c[m][n] for m in range(4)), 1.0) for n in range(4))
    assert math.isclose(sum(y), sum(x), abs_tol=1e-12)
    assert all(min(x) - 1e-12 <= value <= max(x) + 1e-12 for value in y)

# Row normalization alone is insufficient for the output convex bound:
# both inputs are sent to one output.
row_only = [[1.0, 0.0], [1.0, 0.0]]
assert all(sum(row) == 1 for row in row_only)
assert [sum(row_only[m][n] for m in range(2)) for n in range(2)] == [2, 0]
assert [sum(row_only[m][n] * 3.0 for m in range(2)) for n in range(2)] == [6, 0]

assert 4 * 4096 * 2 == 32 * 1024
assert 16 * 128 * 128 * 2 == 512 * 1024
assert (4 + 4 + 16) * (4 * 4096) == 393216
assert 154880 // 4 == 38720
print('PASS: pinned 45-layer schedule, two independent layer axes, TP shapes, '
      'mHC transpose counterexample, 100 stochastic-matrix conservation cases '
      'and payload accounting. No kernel or performance validation.')

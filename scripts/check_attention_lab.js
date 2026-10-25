'use strict';

const assert = require('node:assert/strict');
const model = require('../web/attention-lab.js');
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const vector = (a, b, tolerance) => { assert.equal(a.length, b.length); a.forEach((x, i) => close(x, b[i], tolerance)); };
const matrix = (a, b, tolerance) => { assert.equal(a.length, b.length); a.forEach((row, i) => vector(row, b[i], tolerance)); };

// Independent oracle: a row probability is the inverse sum of all pairwise
// exponent ratios. This does not use the streaming max/l/u recurrence or LSE merge.
function probabilityOracle(scores, values) {
  const probabilities = scores.map(score => score === -Infinity ? 0 : 1 / scores.reduce((sum, other) => sum + Math.exp(other - score), 0));
  return values[0].map((_, c) => values.reduce((sum, row, r) => sum + probabilities[r] * row[c], 0));
}
const toyScores = [0, Math.log(3), Math.log(2), Math.log(4)];
const toyValues = [[2, 0], [8, 2], [4, 6], [10, 4]];
const groups = [[0, 1], [2, 3]];
const online = model.onlineAttention(toyScores, toyValues, groups);
const split = model.splitAttention(toyScores, toyValues, groups);
vector(online.output, [7.4, 3.4]);
vector(split.output, [7.4, 3.4]);
close(online.trace[0].l, 4 / 3);
vector(online.trace[0].u, [26 / 3, 2]);
close(online.trace[1].alpha, 3 / 4);
close(online.l, 2.5);
vector(online.u, [18.5, 8.5]);
close(online.lse, Math.log(10));
vector(split.partials[0].output, [6.5, 1.5]);
vector(split.partials[1].output, [8, 14 / 3]);
vector(split.weights, [0.4, 0.6]);
assert.ok(Math.abs((split.partials[0].output[0] + split.partials[1].output[0]) / 2 - split.output[0]) > 0.1);

// Exercise each contiguous partition of the toy row, plus unordered partitions.
const partitions = [];
for (let mask = 0; mask < 8; mask++) {
  const p = [[0]];
  for (let i = 1; i < 4; i++) { if (mask & (1 << (i - 1))) p.push([]); p[p.length - 1].push(i); }
  partitions.push(p);
}
partitions.push([[3, 1], [0, 2]], [[3], [2], [1], [0]]);
for (const partition of partitions) {
  for (const offset of [-1000, 0, 1000]) {
    const scores = toyScores.map(s => s + offset);
    const a = model.onlineAttention(scores, toyValues, partition);
    const b = model.splitAttention(scores, toyValues, partition);
    vector(a.output, [7.4, 3.4]);
    vector(b.output, [7.4, 3.4]);
    close(a.lse, Math.log(10) + offset);
    close(b.lse, Math.log(10) + offset);
    close(b.weights.reduce((x, y) => x + y, 0), 1);
  }
}

// Deterministic varied shapes and partitions; no browser and no device needed.
let seed = 123456789;
const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
for (let trial = 0; trial < 100; trial++) {
  const rows = 1 + trial % 9, width = 1 + trial % 5;
  const scores = Array.from({length: rows}, () => rand() * 20 - 10);
  const values = Array.from({length: rows}, () => Array.from({length: width}, () => rand() * 12 - 6));
  const indices = Array.from({length: rows}, (_, i) => i).reverse();
  const p = [[], [], []];
  indices.forEach((i, j) => p[j % 3].push(i));
  const groups = p.filter(g => g.length);
  const expected = probabilityOracle(scores, values);
  vector(model.onlineAttention(scores, values, groups).output, expected);
  vector(model.splitAttention(scores, values, groups).output, expected);
  vector(model.onlineAttention(scores.map(s => s + 900), values, groups).output, expected);
  vector(model.splitAttention(scores.map(s => s - 900), values, groups).output, expected);
}
// A dominant logit and an underflowing tail should remain finite and normalize.
vector(model.onlineAttention([1000, -1000], [[3, -2], [100, 100]], [[0], [1]]).output, [3, -2]);
vector(model.splitAttention([1000, -1000], [[3, -2], [100, 100]], [[1], [0]]).output, [3, -2]);

// Masked tiles and a short tail: only finite-score rows enter the independent
// probability oracle. All-masked output is an explicit API convention, not a
// claim that softmax(-Infinity,...,-Infinity) has a mathematical normalization.
const maskedScores = [-Infinity, -Infinity, Math.log(2), -Infinity, Math.log(3)];
const maskedValues = [[90, 91], [80, 81], [2, 5], [70, 71], [7, -1]];
const maskedGroups = [[0, 1], [2, 3], [4]];
const masked = model.onlineAttention(maskedScores, maskedValues, maskedGroups);
const maskedSplit = model.splitAttention(maskedScores, maskedValues, maskedGroups);
const maskedExpected = probabilityOracle(maskedScores, maskedValues);
vector(masked.output, maskedExpected);
vector(masked.output, [5, 1.4]);
vector(maskedSplit.output, maskedExpected);
assert.equal(masked.trace[0].m, -Infinity);
assert.equal(masked.trace[0].l, 0);
vector(masked.trace[0].u, [0, 0]);
close(maskedSplit.weights[0], 0);
const middleMasked = model.onlineAttention(maskedScores, maskedValues, [[2], [0, 1, 3], [4]]);
close(middleMasked.trace[1].m, middleMasked.trace[0].m);
close(middleMasked.trace[1].l, middleMasked.trace[0].l);
vector(middleMasked.trace[1].u, middleMasked.trace[0].u);
for (const fn of [model.onlineAttention, model.splitAttention]) {
  const emptyVisible = fn([-Infinity, -Infinity], [[1, 2], [3, 4]], [[0], [1]]);
  vector(emptyVisible.output, [0, 0]);
  assert.equal(emptyVisible.lse, -Infinity);
  assert.throws(() => fn([Infinity], [[1]]));
  assert.throws(() => fn([NaN], [[1]]));
}

// Geometry oracle: rotation preserves squared norm and dot products under a
// shared position shift; relative dot comes from the 2D cross/dot identity.
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
for (const pair of [[1, 2], [2, 1], [0, 0], [-3, 5]]) {
  for (const pos of [-2500, 0, 500, 1000, 5000]) {
    const rotated = model.rope(pair, pos, 0.001).output;
    close(dot(rotated, rotated), dot(pair, pair));
    vector(model.rope(rotated, -pos, 0.001).output, pair);
  }
}
const q = [1, 2], k = [2, 1], omega = Math.pow(1e6, -64 / 128);
close(omega, 0.001);
const expectedRelative = 4 * Math.cos(-0.5) + 3 * Math.sin(-0.5);
for (const shift of [0, 100, 500, 20000]) {
  const qr = model.rope(q, 1000 + shift, omega).output;
  const kr = model.rope(k, 500 + shift, omega).output;
  close(dot(qr, kr), expectedRelative);
}

// Independent delta oracle: S_new = (I - beta*k*k^T) S_old + beta*k*v^T.
// Matrix products check the rank-one error update against an affine operator.
function deltaOracle(state, key, value, beta) {
  const n = key.length;
  const transition = Array.from({length: n}, (_, r) => Array.from({length: n}, (_, c) => Number(r === c) - beta * key[r] * key[c]));
  return transition.map((row, r) => value.map((v, c) => row.reduce((sum, a, j) => sum + a * state[j][c], 0) + beta * key[r] * v));
}
let state = [[0, 0], [0, 0]];
const events = [
  {k: [1, 0], v: [2, 1], beta: 1, q: [1, 0]},
  {k: [0.6, 0.8], v: [1, 3], beta: 0.5, q: [0, 1]},
  {k: [0, 1], v: [-2, 5], beta: 1, q: [0.2, -0.8]},
  {k: [0.8, -0.6], v: [4, -1], beta: 0, q: [0.8, 0.6]}
];
events.forEach((event, i) => {
  const saved = state.map(row => row.slice());
  const expected = deltaOracle(state, event.k, event.v, event.beta);
  const actual = model.deltaStep(state, event.k, event.v, event.beta, event.q);
  matrix(actual.state, expected);
  matrix(state, saved); // The previous state is not mutated.
  vector(actual.output, expected[0].map((_, c) => expected.reduce((sum, row, r) => sum + row[c] * event.q[r], 0)));
  if (i === 1) { matrix(actual.state, [[1.94, 1.72], [-0.08, 0.96]]); vector(actual.output, [-0.08, 0.96]); }
  if (i === 2) vector(actual.state[1], event.v); // Unit key and beta=1 overwrite its queried association.
  if (i === 3) matrix(actual.state, state); // beta=0 cannot change memory.
  state = actual.state;
});
// Repeated same unit key with beta=1 replaces that association, rather than
// accumulating values as ordinary ungated linear attention would.
const firstWrite = model.deltaStep([[0, 0], [0, 0]], [1, 0], [2, 3], 1, [1, 0]);
const replace = model.deltaStep(firstWrite.state, [1, 0], [-4, 7], 1, [1, 0]);
vector(replace.output, [-4, 7]);

// Gate the key rows before prediction: this distinguishes KDA ordering from
// applying decay after the error was already calculated from the old state.
const oldState = [[1, 0], [0, 1]];
const ungated = model.deltaStep(oldState, [1, 0], [3, 4], 0.5, [0, 1]);
const decayedState = model.gateState(oldState, [0.5, 1]);
const gated = model.deltaStep(decayedState, [1, 0], [3, 4], 0.5, [0, 1]);
matrix(decayedState, [[0.5, 0], [0, 1]]);
matrix(ungated.state, [[2, 2], [0, 1]]);
matrix(gated.state, [[1.75, 2], [0, 1]]);
vector(gated.prediction, [0.5, 0]);
vector(gated.residual, [2.5, 4]);
vector(gated.output, ungated.output);
assert.notEqual(gated.state[0][0], ungated.state[0][0]);
matrix(oldState, [[1, 0], [0, 1]]);
matrix(model.gateState(oldState, [0, 0]), [[0, 0], [0, 0]]);
matrix(model.gateState(oldState, [1, 1]), oldState);
assert.throws(() => model.gateState(oldState, [1]));
assert.throws(() => model.gateState(oldState, [1, Infinity]));

for (const bad of [[], [[0], [0, 1, 2, 3]], [[0, 1], [2]], [[0, 1], [2, 4]], [[0, 1], []]]) {
  assert.throws(() => model.onlineAttention(toyScores, toyValues, bad));
  assert.throws(() => model.splitAttention(toyScores, toyValues, bad));
}
assert.throws(() => model.onlineAttention([], []));
assert.throws(() => model.onlineAttention([NaN], [[1]]));
assert.throws(() => model.onlineAttention([0, 1], [[1, 2], [1]]));
assert.throws(() => model.rope([1, 2, 3], 1, 1));
assert.throws(() => model.rope([1, Infinity], 1, 1));
assert.throws(() => model.deltaStep([[0]], [1, 0], [1], 1, [1]));
console.log('Attention labs: independent softmax oracle; all toy partitions; 100 varied shapes; ±1000 shift stability; masked tiles and short tails; LSE-weighted decode merge; RoPE geometry and relative position; affine-matrix delta oracle, overwrite semantics and gate-before-prediction order passed. Teaching arithmetic only, not hardware performance.');

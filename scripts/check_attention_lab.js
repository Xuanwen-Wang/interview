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

// MLA has a diagram animation, not a production model implementation here.
// These independent teaching checks validate the displayed algebra and numbers.
// The dense oracle expands K/V and normalizes with pairwise exponent ratios;
// the compact path contracts Q first, then uses the tested streaming primitive.
const rowTimes = (row, weights) => weights[0].map((_, j) => row.reduce((sum, x, i) => sum + x * weights[i][j], 0));
const transpose = weights => weights[0].map((_, j) => weights.map(row => row[j]));
const differs = (a, b, epsilon = 1e-6) => a.some((x, i) => Math.abs(x - b[i]) > epsilon);

// The introductory examples separate token count from feature width and use
// unequal latent/key widths so absorption visibly widens the current query.
const introW = [[1, 0], [0, 1], [1, 1], [-1, 0]];
vector(rowTimes([1, 2, 3, 1], introW), [3, 5]);
// A second token uses the same weights without mixing with the first token.
vector(rowTimes([0, 1, 0, 0], introW), [0, 1]);
const introC = [[1, 2, 0], [3, 1, 1]];
const introAK = [[1, 0], [1, 1], [0, 2]], introQ = [2, 1];
matrix(introC.map(c => rowTimes(c, introAK)), [[3, 2], [4, 3]]);
vector(rowTimes(introQ, transpose(introAK)), [2, 3, 2]);
vector(introC.map(c => dot(rowTimes(introQ, transpose(introAK)), c)), [8, 11]);
vector(introC.map(c => dot(introQ, rowTimes(c, introAK))), [8, 11]);
close(0.25 * (2 * 1 + 2) + 0.75 * (2 * 3 + 1), 6.25);
close(2 * (0.25 * 1 + 0.75 * 3) + (0.25 * 2 + 0.75 * 1), 6.25);

// The full two-position fixture deliberately omits RoPE and
// scaling so the first encounter with absorption has small, inspectable values.
const mlaToyC = [[1, 2], [3, 1]], mlaToyAK = [[1, 0], [1, 1]], mlaToyAV = [[1, 2], [0, 1]];
const mlaToyQ = [2, 1];
const mlaToyK = mlaToyC.map(row => rowTimes(row, mlaToyAK));
const mlaToyV = mlaToyC.map(row => rowTimes(row, mlaToyAV));
matrix(mlaToyK, [[3, 2], [4, 1]]);
matrix(mlaToyV, [[1, 4], [3, 7]]);
const mlaToyScores = mlaToyK.map(key => dot(mlaToyQ, key));
vector(mlaToyScores, [8, 9]);
vector(rowTimes(mlaToyQ, transpose(mlaToyAK)), [2, 3]);
const mlaToyP = [1 / (1 + Math.E), Math.E / (1 + Math.E)];
vector(rowTimes(mlaToyP, mlaToyC), [2.46211715726001, 1.2689414213699952]);
const mlaToyExpected = probabilityOracle(mlaToyScores, mlaToyV);
vector(mlaToyExpected, [2.46211715726001, 6.193175735890014]);
vector(rowTimes(rowTimes(mlaToyP, mlaToyC), mlaToyAV), mlaToyExpected);

// Keep the real dimension ratios: content 128:RoPE 64:latent 512:value 128
// become 4:2:16:4. Heads and sequence length are small independent test axes.
// C denotes the already-normalized latent. These synthetic weights are not a
// checkpoint, and the test does not claim to run DeepSeek or measure hardware.
const mlaShape = {heads: 3, rows: 7, content: 4, rope: 2, latent: 16, value: 4, hidden: 10};
const fixture = (rows, cols, phase) => Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => Math.sin((r + 1) * (c + 2) + phase) * 0.7));
const mlaC = fixture(mlaShape.rows, mlaShape.latent, 0.2);
const mlaKR = fixture(mlaShape.rows, mlaShape.rope, 1.3);
const mlaQC = fixture(mlaShape.heads, mlaShape.content, 2.1);
const mlaQR = fixture(mlaShape.heads, mlaShape.rope, 3.4);
const mlaOutputWeights = fixture(mlaShape.heads * mlaShape.value, mlaShape.hidden, 4.2);
const mlaOmega = 0.37, mlaPosition = 6;
const rotatePair = (pair, angle) => [pair[0] * Math.cos(angle) - pair[1] * Math.sin(angle), pair[0] * Math.sin(angle) + pair[1] * Math.cos(angle)];

// V2 checkpoint scale: qk_nope=128, qk_rope=64, YaRN factor=40,
// mscale_all_dim=0.707. Absorption must preserve this scalar independently of
// the effective latent contraction width. We retain it in the synthetic test.
const mlaModelScale = (1 + 0.1 * 0.707 * Math.log(40)) ** 2 / Math.sqrt(192);
close(mlaModelScale, 0.11472138679292612);
const mlaMasks = [
  [true, true, true, true, true, true, true],
  [false, false, true, false, true, true, true],
  [false, false, false, false, false, false, true]
];
let detectsWrongScale = false, detectsSeparateSoftmax = false;
for (const visible of mlaMasks) {
  const denseOutputs = [], compactOutputs = [];
  for (let h = 0; h < mlaShape.heads; h++) {
    const ak = fixture(mlaShape.latent, mlaShape.content, 0.8 + h);
    const av = fixture(mlaShape.latent, mlaShape.value, 1.7 + h);
    const denseQ = [...mlaQC[h], ...rotatePair(mlaQR[h], mlaPosition * mlaOmega)];
    const denseK = mlaC.map((row, n) => [...rowTimes(row, ak), ...rotatePair(mlaKR[n], n * mlaOmega)]);
    const denseV = mlaC.map(row => rowTimes(row, av));
    const denseScores = denseK.map((key, n) => visible[n] ? dot(denseQ, key) * mlaModelScale : -Infinity);
    const expected = probabilityOracle(denseScores, denseV);

    const absorbedQ = rowTimes(mlaQC[h], transpose(ak));
    assert.equal(absorbedQ.length, mlaShape.latent);
    const contentScores = mlaC.map(row => dot(absorbedQ, row));
    // Independent relative-angle identity instead of reusing the dense path's
    // two explicit rotations; historical n and current p stay distinct.
    const positionScores = mlaKR.map((key, n) => {
      const angle = (n - mlaPosition) * mlaOmega;
      const cross = mlaQR[h][1] * key[0] - mlaQR[h][0] * key[1];
      return dot(mlaQR[h], key) * Math.cos(angle) + cross * Math.sin(angle);
    });
    const compactScores = contentScores.map((score, n) => visible[n] ? (score + positionScores[n]) * mlaModelScale : -Infinity);
    denseScores.forEach((score, n) => score === -Infinity ? assert.equal(compactScores[n], -Infinity) : close(compactScores[n], score));
    const compactLatent = model.onlineAttention(compactScores, mlaC, [[0, 1], [2, 3], [4, 5], [6]]).output;
    const actual = rowTimes(compactLatent, av);
    vector(actual, expected);
    denseOutputs.push(...expected);
    compactOutputs.push(...actual);

    // Retain the YaRN factor and change only sqrt(192) to sqrt(576), so the
    // counterexample isolates the contraction-width mistake.
    const wrongWidthScale = mlaModelScale * Math.sqrt(192 / 576);
    const wrongScaleScores = contentScores.map((score, n) => visible[n] ? (score + positionScores[n]) * wrongWidthScale : -Infinity);
    detectsWrongScale ||= differs(probabilityOracle(wrongScaleScores, denseV), expected);
    const separateContent = probabilityOracle(contentScores.map((score, n) => visible[n] ? score * mlaModelScale : -Infinity), denseV);
    const separatePosition = probabilityOracle(positionScores.map((score, n) => visible[n] ? score * mlaModelScale : -Infinity), denseV);
    // Even averaging the two normalized outputs to restore unit total weight
    // cannot replace softmax(content + position).
    detectsSeparateSoftmax ||= differs(separateContent.map((x, i) => (x + separatePosition[i]) / 2), expected);
  }
  vector(rowTimes(compactOutputs, mlaOutputWeights), rowTimes(denseOutputs, mlaOutputWeights));
}
assert.ok(detectsWrongScale, 'Changing to the absorbed width must change the function for this fixture.');
assert.ok(detectsSeparateSoftmax, 'Normalizing the content and positional branches separately must change the function.');

// Noncommutation counterexample in the text: stretch x by 2, then rotate 90
// degrees. Reversing the order changes both the transformed key and its score.
const stretch = [[2, 0], [0, 1]], quarterTurn = [[0, -1], [1, 0]];
const columnTimes = (weights, col) => weights.map(row => dot(row, col));
const rightOrder = columnTimes(quarterTurn, columnTimes(stretch, [1, 0]));
const wrongOrder = columnTimes(stretch, columnTimes(quarterTurn, [1, 0]));
vector(rightOrder, [0, 2]);
vector(wrongOrder, [0, 1]);
close(dot([1, 1], rightOrder), 2);
close(dot([1, 1], wrongOrder), 1);

// Capacity and core-FLOP ledger from the guide, not runtime allocations.
const mlaN = 4096, mlaHeads = 128, bf16Bytes = 2, MiB = 2 ** 20;
close(mlaN * (mlaHeads * (128 + 128) + 64) * bf16Bytes / MiB, 256.5);
close(mlaN * (512 + 64) * bf16Bytes / MiB, 4.5);
close(mlaN * mlaHeads * (192 + 128) * bf16Bytes / MiB, 320);
close(256.5 / 4.5, 57);
assert.equal(2 * mlaHeads * mlaN * (192 + 128), 335544320);
assert.equal(2 * mlaHeads * mlaN * (576 + 512), 1140850688);

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
console.log('Attention labs: independent softmax oracle; all toy partitions; 100 varied shapes; ±1000 shift stability; masked tiles and short tails; LSE-weighted decode merge; RoPE geometry and relative position; affine-matrix delta oracle, overwrite semantics and gate-before-prediction order; MLA expanded versus compact attention with RoPE, masks, checkpoint scale and output projection; wrong-scale and separate-softmax counterexamples; noncommuting rotation; teaching capacity/FLOP ledger passed. Teaching arithmetic only, not a model execution or hardware performance result.');

// FA3 teaching schedule: check the data-dependency DAG independently of the
// runtime state machine. Positions represent a partial-order linearization,
// not latency or an assumption that WGMMA operations run simultaneously.
const pipeline = model.fa3PipelineEvents();
const position = (op, tile) => pipeline.findIndex(e => e.op === op && e.tile === tile);
const edge = (left, right) => assert.ok(position(...left) >= 0 && position(...left) < position(...right), `${left} must precede ${right}`);
for (let tile = 0; tile < 3; tile++) {
  for (const [from, to] of [['load', 'ready'], ['ready', 'qk'], ['qk', 'score'], ['score', 'softmax'], ['softmax', 'rescale'], ['rescale', 'pv'], ['pv', 'output'], ['output', 'release']]) edge([from, tile], [to, tile]);
  if (tile) {
    edge(['softmax', tile - 1], ['softmax', tile]);
    edge(['output', tile - 1], ['rescale', tile]);
    edge(['output', tile - 1], ['pv', tile]);
  }
  edge(['output', tile], ['normalize', 2]);
  edge(['release', tile], ['normalize', 2]);
}
edge(['release', 0], ['load', 2]);
// A useful overlap has current softmax between issue and completion of the
// preceding PV; m/l may advance, but writing the same u must wait.
for (const tile of [1, 2]) {
  edge(['pv', tile - 1], ['softmax', tile]);
  edge(['softmax', tile], ['output', tile - 1]);
}
const inspection = model.inspectFa3Pipeline(pipeline);
assert.equal(inspection.normalized, true);
assert.deepEqual(inspection.slots, [null, null]);
const overlapState = model.inspectFa3Pipeline(pipeline.filter(e => e.phase <= 4), true);
assert.equal(overlapState.tiles[1].prob, true);
assert.equal(overlapState.tiles[0].pv, true);
assert.equal(overlapState.tiles[0].output, undefined);
assert.equal(overlapState.tiles[1].scaled, undefined);
assert.deepEqual(overlapState.slots, [0, 1]);

// Deliberately violate one dependency at a time. Renumber phases after moving
// events, so a rejection cannot merely be a monotonic-phase check.
function moveBefore(events, moved, target) {
  const copy = events.map(e => ({...e}));
  const [event] = copy.splice(copy.findIndex(e => e.op === moved[0] && e.tile === moved[1]), 1);
  copy.splice(copy.findIndex(e => e.op === target[0] && e.tile === target[1]), 0, event);
  return copy.map((e, phase) => ({...e, phase}));
}
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['qk', 0], ['ready', 0])), /unready/);
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['softmax', 1], ['score', 1])), /ready scores/);
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['pv', 0], ['softmax', 0])), /ready P/);
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['rescale', 1], ['output', 0])), /previous PV/);
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['release', 0], ['output', 0])), /WGMMA still consumes/);
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['load', 2], ['release', 0])), /overwrite/);
assert.throws(() => model.inspectFa3Pipeline(moveBefore(pipeline, ['normalize', 2], ['output', 2])), /every PV/);
assert.throws(() => model.inspectFa3Pipeline(pipeline.slice(0, -1)), /Incomplete/);

// Numeric replay isolates the crucial delayed-u hazard. Unlike onlineAttention,
// m/l and the u rescale/PV accumulator are performed at separate schedule events.
// Compare to the independent pairwise-probability oracle above.
const pipeScores = Array.from({length: 192}, (_, i) => (i % 13) * 0.07 + Math.floor(i / 64) * 1.3);
const pipeValues = Array.from({length: 192}, (_, i) => [1 + i / 192, Math.sin(i * 0.2), i % 7]);
function numericReplay(events) {
  let m = -Infinity, l = 0, u = [0, 0, 0];
  const weights = [], alphas = [];
  for (const {op, tile} of events) {
    const indices = Array.from({length: 64}, (_, k) => tile * 64 + k);
    if (op === 'softmax') {
      const nextMax = Math.max(m, ...indices.map(i => pipeScores[i]));
      alphas[tile] = Math.exp(m - nextMax);
      weights[tile] = indices.map(i => Math.exp(pipeScores[i] - nextMax));
      l = alphas[tile] * l + weights[tile].reduce((a, b) => a + b, 0);
      m = nextMax;
    }
    if (op === 'rescale') u = u.map(x => x * alphas[tile]);
    if (op === 'output') u = u.map((x, c) => x + indices.reduce((sum, i, k) => sum + weights[tile][k] * pipeValues[i][c], 0));
  }
  return u.map(x => x / l);
}
vector(numericReplay(pipeline), probabilityOracle(pipeScores, pipeValues));
const earlyRescale = numericReplay(moveBefore(pipeline, ['rescale', 1], ['output', 0]));
assert.ok(earlyRescale.some((x, i) => Math.abs(x - numericReplay(pipeline)[i]) > 0.01), 'Moving u rescale ahead of pending PV must corrupt this fixture');
console.log('FA3 pipeline: independent dependency DAG, pending-PV overlap, TMA readiness, slot ownership/reuse, drain, delayed-u numerical oracle, and seven illegal schedules passed. Teaching schedule only; no device timing or speedup model.');

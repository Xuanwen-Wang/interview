'use strict';
const assert = require('node:assert/strict');
const {buildSyncStaircase} = require('../web/sync-explorer.js');

// Independent oracle: enumerate every strict chain on a 3 x 3 grid, then
// compare the induced ordering relations, without using suffix minima.
const grid = Array.from({length: 9}, (_, i) => [Math.floor(i / 3) + 1, i % 3 + 1]);
const subsets = [];
for (let mask = 0; mask < 1 << grid.length; mask++) subsets.push(grid.filter((_, i) => mask & (1 << i)));
const chains = subsets.filter(points => points.every(([s, r], i) => !i || (points[i - 1][0] < s && points[i - 1][1] < r)));
const covers = (tokens, [p, c]) => tokens.some(({s, r}) => p <= s && r <= c);
const relation = tokens => new Set(grid.filter(point => covers(tokens, point)).map(point => point.join(',')));
for (const points of subsets) {
  const {tokens} = buildSyncStaircase(points);
  assert(tokens.every((t, i) => !i || tokens[i - 1].s < t.s && tokens[i - 1].r < t.r));
  assert(points.every(point => covers(tokens, point)), `Uncovered input: ${JSON.stringify(points)}`);
  const weakest = relation(tokens);
  for (const chain of chains) {
    const other = chain.map(([s, r]) => ({s, r}));
    if (!points.every(point => covers(other, point))) continue;
    const imposed = relation(other);
    for (const pair of weakest) assert(imposed.has(pair), `Not weakest for ${JSON.stringify(points)} versus ${JSON.stringify(chain)}`);
  }
  assert.deepEqual(buildSyncStaircase([...points].reverse()).tokens, tokens);
  assert.deepEqual(buildSyncStaircase([...points, ...points]).tokens, tokens);
}
const crossed = [[1, 1], [2, 3], [3, 2], [4, 4]];
assert.deepEqual(buildSyncStaircase(crossed).tokens, [{s: 1, r: 1}, {s: 3, r: 2}, {s: 4, r: 4}]);
const ordered = buildSyncStaircase([[1, 1], [2, 2], [3, 3]]).tokens;
assert(!covers(ordered, [3, 1]));
assert(covers([{s: 3, r: 1}], [3, 1]));
console.log(`Sync teaching model PASS: ${subsets.length} input sets x ${chains.length} enumerated chains; coverage, weakest relation, permutation, duplicate and coarsening checks.`);

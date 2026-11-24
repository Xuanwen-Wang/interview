'use strict';
const assert = require('node:assert/strict');
const {buildMailboxPeriodic, buildMailboxAbsorption, runMailboxTrace} = require('../web/mailbox-architecture.js');

// Oracle: flatten all producer epochs first; FIFO ranks imply the pairing,
// independently of the interleaving used by the visual witness builder.
let periodicCases = 0;
for (let n = 1; n <= 4; n++) for (let k = 0; k <= n; k++) for (let trips = 0; trips <= 3; trips++) {
  const trace = runMailboxTrace(buildMailboxPeriodic(n, k, trips));
  assert(trace.complete);
  assert.deepEqual(trace.issues, []);
  assert.equal(trace.sends, n * trips + k);
  assert.equal(trace.receives, n * trips + k);
  const producerStream = Array.from({length: k}, (_, j) => 'seed' + j).concat(
    Array.from({length: n * trips}, (_, rank) => 's' + (rank % n + 1) + '⁽' + Math.floor(rank / n) + '⁾'));
  assert.deepEqual(trace.rows.filter(r => r.consumed).map(r => r.consumed.id), producerStream);
  const body = trace.rows.filter(r => r.event.kind === 'recv');
  for (let rank = 0; rank < body.length; rank++) {
    const source = rank - k;
    const expected = source < 0 ? 'seed' + rank : 's' + (source % n + 1) + '⁽' + Math.floor(source / n) + '⁾';
    assert.equal(body[rank].consumed.id, expected);
  }
  periodicCases++;
}

for (const k of [1, 2]) for (let trips = 0; trips <= 3; trips++) {
  const trace = runMailboxTrace(buildMailboxAbsorption(k, trips));
  assert(trace.complete);
  assert.deepEqual(trace.issues, []);
  assert.equal(trace.sends, k * (trips + 1));
  const body = trace.rows.filter(r => r.event.kind === 'recv');
  for (let rank = k; rank < body.length; rank++) {
    assert.equal(body[rank].consumed.id, 's' + (rank % k) + '⁽' + (Math.floor(rank / k) - 1) + '⁾');
  }
  const parent = trace.rows.at(-1);
  assert(parent.consumed.coversParent);
  assert.equal(parent.consumed.id, trips ? 's' + (k - 1) + '⁽' + (trips - 1) + '⁾' : k === 1 ? 'P' : 'seed1');
  const bad = runMailboxTrace(buildMailboxAbsorption(k, trips, true));
  assert.equal(bad.queue.length, 1);
  if (trips >= 2) assert(bad.rows.some(r => r.event.kind === 'recv' && r.issues.length));
}

// Fixed witnesses expose slot shifts that mere final-balance assertions miss.
const pairing = (k, trips) => runMailboxTrace(buildMailboxAbsorption(k, trips)).rows.filter(r => r.consumed).map(r => r.consumed.id);
assert.deepEqual(pairing(2, 0), ['P', 'seed1']);
assert.deepEqual(pairing(2, 2), ['P', 'seed1', 's0⁽0⁾', 's1⁽0⁾', 's0⁽1⁾', 's1⁽1⁾']);
const wrongParent = runMailboxTrace([{kind: 'send', credit: {id: 'unrelated'}}, {kind: 'parent', requiresParent: true}]);
assert(wrongParent.issues.some(issue => issue.includes('父依赖未覆盖')));
const empty = runMailboxTrace([{kind: 'recv', expectedId: 'x'}, {kind: 'send', credit: {id: 'x'}}]);
assert(!empty.complete);
assert.equal(empty.sends, 0);
assert.throws(() => buildMailboxPeriodic(2, 3, 1), RangeError);
assert.throws(() => buildMailboxAbsorption(3, 1), RangeError);
console.log('Mailbox architecture PASS: ' + periodicCases + ' periodic cases, 8 absorption cases and their extra-seed counterexamples; provenance, FIFO rank, zero-trip, residual, blocked-wait and parent-coverage checks.');

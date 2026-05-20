const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DualQueue } = require('../src/queue/dual-queue');

test('Dual Queue Priority Semantics', async () => {
  const queue = new DualQueue();
  const processed = [];

  queue.setDispatcher(async (msg, source) => {
    processed.push({ msg, source });
    // Simulate tiny async delay
    await new Promise(r => setTimeout(r, 2));
  });

  queue.start();

  // Enqueue 10 on Q1
  for (let i = 1; i <= 10; i++) {
    queue.enqueueRelay({ val: `L${i}` });
  }

  // Wait briefly for dispatcher to start processing Q1
  await new Promise(r => setTimeout(r, 5));

  // Enqueue 5 on Q2 mid-drain
  queue.enqueueRetransmission([
    { val: 'R1' }, { val: 'R2' }, { val: 'R3' }, { val: 'R4' }, { val: 'R5' }
  ]);

  // Wait for complete drain
  await new Promise(r => setTimeout(r, 100));
  queue.stop();

  assert.equal(processed.length, 15, 'All messages should be processed');

  // Verify priority: R1..R5 MUST be processed contiguously once they arrive,
  // preempting any remaining L messages.
  const rIndices = processed.map((p, i) => p.source === 'Q2' ? i : -1).filter(i => i !== -1);

  assert.equal(rIndices.length, 5, 'Should have exactly 5 Q2 messages processed');

  // R messages should be contiguous (meaning Q2 completely preempted Q1)
  for (let i = 1; i < rIndices.length; i++) {
    assert.equal(rIndices[i], rIndices[i - 1] + 1, 'Q2 messages must be processed back-to-back without Q1 interruption');
  }
});

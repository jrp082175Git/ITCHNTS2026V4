const { test } = require('node:test');
const assert = require('node:assert/strict');
const dispatcher = require('../src/handlers/dispatcher');
const { dispatch, setExpectedSequence, getExpectedSequence, setRetransmissionClient, metrics, getStagedAge } = dispatcher;

test('Dispatcher - Gap Detection, Staging, and Duplicates', async () => {
  setExpectedSequence(1);

  let reqStart = null, reqEnd = null;
  const mockRetrans = {
    requestRange: async (start, end) => {
      reqStart = start;
      reqEnd = end;
    }
  };
  setRetransmissionClient(mockRetrans);

  // Fake handlers to prevent timeout/failure
  const registry = require('../src/handlers/message-types/index');
  for (const k of Object.keys(registry)) {
    registry[k] = async () => {};
  }

  // Mock redis and state to no-op
  const redis = require('../src/storage/redis');
  redis.storeProcessed = async () => {};
  const seqStore = require('../src/state/sequence-store');
  seqStore.updateLastSequence = () => {};

  // 1. Process 1
  await dispatch({ sequenceNo: 1, msgType: 'A' }, 'Q1');
  assert.equal(getExpectedSequence(), 2);

  // 2. Process duplicate 1
  await dispatch({ sequenceNo: 1, msgType: 'A' }, 'Q1');
  assert.equal(getExpectedSequence(), 2, 'Duplicate should not advance seq');

  // 3. Gap: receive 4. (Expect [2..3] to be requested)
  await dispatch({ sequenceNo: 4, msgType: 'A' }, 'Q1');
  assert.equal(getExpectedSequence(), 2, 'Gap should not advance seq');
  assert.equal(reqStart, 2);
  assert.equal(reqEnd, 3);

  // 4. Fill gap via Q2
  await dispatch({ sequenceNo: 2, msgType: 'A' }, 'Q2');
  assert.equal(getExpectedSequence(), 3);
  await dispatch({ sequenceNo: 3, msgType: 'A' }, 'Q2');

  // 5. Check if the staged message (4) was automatically processed
  assert.equal(getExpectedSequence(), 5, 'Staged message 4 should have been processed automatically after 3');

  // 6. Non-sequenced message
  await dispatch({ packetType: 'R' }, 'Q1');
  assert.equal(getExpectedSequence(), 5, 'Non-sequenced message should not touch expectedSequence');
});

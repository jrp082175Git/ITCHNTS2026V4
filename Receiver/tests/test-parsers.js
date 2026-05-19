const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseItchMessage, parseSequencedPayload, LENGTHS } = require('../src/parsers/itch-dispatcher');

test('Parse Add Anonymous Order (Type A)', () => {
  // Construct a buffer of size 41
  const buf = Buffer.alloc(LENGTHS['A']);
  buf.write('A', 0); // Type
  buf.writeInt32BE(123456, 1); // nanos
  buf.writeBigInt64BE(BigInt('1234567890'), 5); // orderId
  buf.writeInt32BE(99, 13); // orderBookId
  buf.write('B', 17); // side
  buf.writeInt32BE(100, 18); // orderBookPosition
  buf.writeBigInt64BE(BigInt('500'), 22); // quantity
  buf.writeBigInt64BE(BigInt('10050'), 30); // price
  buf.writeInt16BE(1, 38); // exchangeOrderType
  buf.writeInt8(0, 40); // quantityCondition

  const msg = parseItchMessage(buf);
  assert.equal(msg.msgType, 'A');
  assert.equal(msg.nanos, 123456);
  assert.equal(msg.orderId, '1234567890');
  assert.equal(msg.orderBookId, 99);
  assert.equal(msg.side, 'B');
  assert.equal(msg.orderBookPosition, 100);
  assert.equal(msg.quantity, '500');
  assert.equal(msg.price, '10050');
  assert.equal(msg.exchangeOrderType, 1);
  assert.equal(msg.quantityCondition, 0);
});

test('Parse Sequenced Payload - Multi-block', () => {
  const bufA = Buffer.alloc(LENGTHS['A']);
  bufA.write('A', 0);

  const bufT = Buffer.alloc(LENGTHS['T']);
  bufT.write('T', 0);

  const payload = Buffer.concat([bufA, bufT, bufA]);

  const { messages, nextSeq } = parseSequencedPayload(payload, 100);

  assert.equal(messages.length, 3);
  assert.equal(messages[0].parsed.msgType, 'A');
  assert.equal(messages[0].parsed.sequenceNo, 100);

  assert.equal(messages[1].parsed.msgType, 'T');
  assert.equal(messages[1].parsed.sequenceNo, 101);

  assert.equal(messages[2].parsed.msgType, 'A');
  assert.equal(messages[2].parsed.sequenceNo, 102);

  assert.equal(nextSeq, 103);
});

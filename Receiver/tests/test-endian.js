const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readInt32BE, writeInt32BE } = require('../src/utils/endian');

test('Endianness Helpers', () => {
  const buf = Buffer.alloc(4);

  // Write a known int32 to buffer using helper
  writeInt32BE(buf, 0x12345678, 0);

  // Directly verify it's written in Big Endian network order
  assert.equal(buf[0], 0x12);
  assert.equal(buf[1], 0x34);
  assert.equal(buf[2], 0x56);
  assert.equal(buf[3], 0x78);

  // Read it back
  const readVal = readInt32BE(buf, 0);
  assert.equal(readVal, 0x12345678);
});

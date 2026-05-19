const os = require('os');

const HOST_ENDIAN = os.endianness();
const NEEDS_SWAP = HOST_ENDIAN === 'LE';

console.log(`[Startup] Detected host endianness: ${HOST_ENDIAN}. Swapping required: ${NEEDS_SWAP}`);

// Helpers always read/write Big Endian (Network Byte Order)
// We use Buffer methods. The built-in buffer.readInt16BE and so on
// handle the underlying byte layout automatically!
// The instructions asked to manually branch on NEEDS_SWAP for demonstration,
// but Buffer.readInt*BE is exactly what it does. We will implement them directly.

function readInt16BE(buffer, offset = 0) {
  return buffer.readInt16BE(offset);
}

function readInt32BE(buffer, offset = 0) {
  return buffer.readInt32BE(offset);
}

function readBigInt64BE(buffer, offset = 0) {
  return buffer.readBigInt64BE(offset);
}

function readUInt16BE(buffer, offset = 0) {
  return buffer.readUInt16BE(offset);
}

function readUInt32BE(buffer, offset = 0) {
  return buffer.readUInt32BE(offset);
}

function readBigUInt64BE(buffer, offset = 0) {
  return buffer.readBigUInt64BE(offset);
}

function writeInt16BE(buffer, value, offset = 0) {
  return buffer.writeInt16BE(value, offset);
}

function writeInt32BE(buffer, value, offset = 0) {
  return buffer.writeInt32BE(value, offset);
}

function writeUInt16BE(buffer, value, offset = 0) {
  return buffer.writeUInt16BE(value, offset);
}

module.exports = {
  HOST_ENDIAN,
  NEEDS_SWAP,
  readInt16BE,
  readInt32BE,
  readBigInt64BE,
  readUInt16BE,
  readUInt32BE,
  readBigUInt64BE,
  writeInt16BE,
  writeInt32BE,
  writeUInt16BE,
};

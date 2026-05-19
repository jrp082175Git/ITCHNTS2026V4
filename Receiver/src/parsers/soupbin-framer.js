const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

class SoupBinFramer extends EventEmitter {
  constructor(maxBufferBytes = 16 * 1024 * 1024) {
    super();
    this.accumulator = Buffer.alloc(0);
    this.maxBufferBytes = maxBufferBytes;
  }

  feed(chunk) {
    if (!chunk || chunk.length === 0) return;

    // Concat the new chunk
    this.accumulator = Buffer.concat([this.accumulator, chunk]);

    // Bounding check for runaway buffering
    if (this.accumulator.length > this.maxBufferBytes) {
      logger.error(`SoupBinFramer buffer exceeded ${this.maxBufferBytes} bytes. Dropping connection.`);
      this.emit('error', new Error('Framer buffer overflow'));
      return;
    }

    let offset = 0;

    // Need at least 2 bytes to read the packet length
    while (offset + 2 <= this.accumulator.length) {
      const packetLength = this.accumulator.readUInt16BE(offset);

      // Length includes type byte (1) + payload
      if (packetLength < 1) {
        logger.error(`Invalid packet length ${packetLength} at offset ${offset}.`);
        this.emit('error', new Error('Invalid packet length < 1'));
        return;
      }

      const totalPacketLength = 2 + packetLength;

      // Do we have the full packet?
      if (offset + totalPacketLength <= this.accumulator.length) {
        // We have a full packet. Extract it.
        const packetBuffer = this.accumulator.subarray(offset, offset + totalPacketLength);

        // Emit for processing
        this.emit('packet', packetBuffer);

        // Advance offset
        offset += totalPacketLength;
      } else {
        // Not enough bytes for the full packet yet
        break;
      }
    }

    // Compact accumulator if we consumed anything
    if (offset > 0) {
      if (offset === this.accumulator.length) {
        this.accumulator = Buffer.alloc(0); // Fully consumed
      } else {
        this.accumulator = this.accumulator.subarray(offset); // Keep the rest
      }
    }
  }
}

module.exports = { SoupBinFramer };

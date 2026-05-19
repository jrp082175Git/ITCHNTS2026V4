const { logger } = require('../utils/logger');
const redis = require('../storage/redis');
const { parseSequencedPayload } = require('../parsers/itch-dispatcher');
const { getExpectedSequence, setExpectedSequence } = require('./login-accepted');
const sessionStore = require('../state/session-store');

async function handleSequencedData(packetBuffer, io, tcpRelay) {
  // SoupBin header is 3 bytes (2 length, 1 type). Payload is everything after.
  const payload = packetBuffer.subarray(3);
  const startingSeq = getExpectedSequence();

  const { messages, nextSeq } = parseSequencedPayload(payload, startingSeq);

  if (messages.length === 0) {
    return;
  }

  // Use a single Redis pipeline per batch to amortize RTT
  const pipeline = redis.getPipeline();

  for (const msgObj of messages) {
    const { parsed, raw } = msgObj;
    const jsonString = JSON.stringify(parsed);

    // Enqueue storage commands into pipeline synchronously (no await)
    redis.storeSequencedMessage(parsed.sequenceNo, raw, jsonString, pipeline);

    // Logging
    logger.json('Sequenced', jsonString);

    // Broadcast volatilely if it's Socket.IO
    if (io) {
      io.volatile.emit('itch', parsed);
    }

    // Broadcast TCP
    if (tcpRelay) {
      tcpRelay.broadcast(jsonString);
    }
  }

  // Execute the pipeline
  await redis.executePipeline(pipeline);

  // Update expected sequence for next packet
  setExpectedSequence(nextSeq);

  // Fast-path state update (will coalesce disk writes to 250ms max freq)
  sessionStore.updateLastSequence(nextSeq - 1);
}

module.exports = {
  handleSequencedData
};

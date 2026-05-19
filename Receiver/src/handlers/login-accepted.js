const { logger } = require('../utils/logger');
const redis = require('../storage/redis');
const sessionStore = require('../state/session-store');

let expectedSequence = 1;

function getExpectedSequence() {
  return expectedSequence;
}

function setExpectedSequence(seq) {
  expectedSequence = seq;
}

async function handleLoginAccepted(packetBuffer, io) {
  // Offset 3, len 10: Session
  const session = packetBuffer.toString('ascii', 3, 13).trimEnd();
  // Offset 13, len 20: Sequence Number
  const seqStr = packetBuffer.toString('ascii', 13, 33).trimStart();
  const sequenceNumber = parseInt(seqStr, 10);

  const jsonObject = {
    packetType: 'A',
    session,
    sequenceNumber
  };

  const jsonString = JSON.stringify(jsonObject);

  // Storage and Logging
  await redis.storeLoginAccepted(packetBuffer, jsonString);
  logger.json('LoginAccepted', jsonString);

  // Broadcast
  if (io) {
    io.emit('itch', jsonObject);
  }

  console.log('Login Accepted.');

  // State Persistence
  sessionStore.write({ sessionId: session, lastSequence: sequenceNumber });
  setExpectedSequence(sequenceNumber);
}

module.exports = {
  handleLoginAccepted,
  getExpectedSequence,
  setExpectedSequence
};

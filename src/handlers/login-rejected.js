const { logger } = require('../utils/logger');
const redis = require('../storage/redis');

async function handleLoginRejected(packetBuffer, io) {
  // Reject Reason Code at offset 3
  const rejectCode = String.fromCharCode(packetBuffer[3]);
  let rejectMeaning = 'Unknown';
  if (rejectCode === 'A') rejectMeaning = 'Not Authorized';
  if (rejectCode === 'S') rejectMeaning = 'Session not available';

  const jsonObject = {
    packetType: 'J',
    rejectReason: rejectCode,
    rejectMeaning
  };

  const jsonString = JSON.stringify(jsonObject);

  // Storage and Logging
  await redis.storeLoginRejected(packetBuffer, jsonString);
  logger.json('LoginRejected', jsonString);

  // Broadcast
  if (io) {
    io.emit('itch', jsonObject);
  }

  console.log('Login Rejected. Exiting...');

  setTimeout(() => {
    process.exit(2);
  }, 100);
}

module.exports = {
  handleLoginRejected
};

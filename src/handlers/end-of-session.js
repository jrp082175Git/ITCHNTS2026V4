const { logger } = require('../utils/logger');
const redis = require('../storage/redis');

async function handleEndOfSession(packetBuffer, io) {
  const jsonObject = { packetType: 'Z' };
  const jsonString = JSON.stringify(jsonObject);

  await redis.storeEndOfSession(packetBuffer, jsonString);
  logger.json('EndOfSession', jsonString);

  if (io) {
    io.emit('itch', jsonObject);
  }

  console.log('End of Session received. Initiating graceful shutdown.');

  // Notify index.js or global shutdown process
  // For now, we will just exit after giving a small window
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

module.exports = {
  handleEndOfSession
};

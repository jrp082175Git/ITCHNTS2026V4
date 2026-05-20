const { createClient } = require('redis');
const config = require('../config/loader');
const { logger } = require('../utils/logger');

const redisConfig = config.redis;
const url = `redis://${redisConfig.username ? `${redisConfig.username}:${redisConfig.password}@` : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`;

const client = createClient({ url });

client.on('error', (err) => logger.error(`Redis Client Error: ${err}`));

async function connect() {
  await client.connect();
  logger.info('Connected to Redis');
}

async function disconnect() {
  await client.quit();
  logger.info('Disconnected from Redis');
}

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

const prefix = redisConfig.keyPrefix || 'PROCESSOR';

async function storeProcessed(seqNo, jsonString) {
  const date = today();
  const multi = client.multi();

  const slotKey = `${prefix}:${date}:processed:${seqNo}`;
  const lastSeqKey = `${prefix}:${date}:lastSeq`;

  multi.set(slotKey, jsonString);
  multi.set(lastSeqKey, seqNo.toString());

  multi.expire(slotKey, 604800); // 7 days
  multi.expire(lastSeqKey, 604800);

  await multi.exec();
}

async function getLastSequence() {
  const date = today();
  const lastSeqKey = `${prefix}:${date}:lastSeq`;
  const val = await client.get(lastSeqKey);
  return val ? parseInt(val, 10) : 0;
}

async function logRetransmissionRequest({ beginningSequence, endingSequence, at }) {
  const date = today();
  const listKey = `${prefix}:${date}:retransmit:requests`;

  const payload = JSON.stringify({ beginningSequence, endingSequence, at });

  const multi = client.multi();
  multi.lPush(listKey, payload);
  multi.lTrim(listKey, 0, 999); // Cap at 1000
  multi.expire(listKey, 604800);

  await multi.exec();
}

module.exports = {
  client,
  connect,
  disconnect,
  today,
  storeProcessed,
  getLastSequence,
  logRetransmissionRequest
};

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

const prefix = redisConfig.keyPrefix || 'ITCH';

async function storeLoginAccepted(buffer, jsonString) {
  const date = today();
  const multi = client.multi();
  const binKey = `${prefix}:${date}:bin:loginAccepted`;
  const jsonKey = `${prefix}:${date}:json:loginAccepted`;

  multi.set(binKey, buffer);
  multi.set(jsonKey, jsonString);
  multi.expire(binKey, 604800);
  multi.expire(jsonKey, 604800);

  await multi.exec();
}

async function storeLoginRejected(buffer, jsonString) {
  const date = today();
  const multi = client.multi();
  const binKey = `${prefix}:${date}:bin:loginRejected`;
  const jsonKey = `${prefix}:${date}:json:loginRejected`;

  multi.set(binKey, buffer);
  multi.set(jsonKey, jsonString);
  multi.expire(binKey, 604800);
  multi.expire(jsonKey, 604800);

  await multi.exec();
}

async function storeEndOfSession(buffer, jsonString) {
  const date = today();
  const multi = client.multi();
  const binKey = `${prefix}:${date}:bin:endOfSession`;
  const jsonKey = `${prefix}:${date}:json:endOfSession`;

  multi.set(binKey, buffer);
  multi.set(jsonKey, jsonString);
  multi.expire(binKey, 604800);
  multi.expire(jsonKey, 604800);

  await multi.exec();
}

// In burst scenarios, it's better to queue commands to a pipeline
// and flush them. We'll expose the pipeline to the caller or allow them
// to provide one. For the standard case, we'll implement a standalone method.
async function storeSequencedMessage(seqNo, buffer, jsonString, multiPipeline = null) {
  const date = today();
  const execute = !multiPipeline;
  const multi = multiPipeline || client.multi();

  const binKey = `${prefix}:${date}:bin:${seqNo}`;
  const jsonKey = `${prefix}:${date}:json:${seqNo}`;
  const seqSetKey = `${prefix}:${date}:seq`;
  const seqBinSetKey = `${prefix}:${date}:seqbin`;

  multi.set(binKey, buffer);
  multi.set(jsonKey, jsonString);
  multi.zAdd(seqSetKey, [{ score: seqNo, value: jsonString }]);
  multi.zAdd(seqBinSetKey, [{ score: seqNo, value: buffer.toString('base64') }]);

  // Set expiry on individual keys
  multi.expire(binKey, 604800);
  multi.expire(jsonKey, 604800);

  if (execute) {
    await multi.exec();
    // Expiry for sets, ensuring it gets set only once per day ideally,
    // but safe to run each time.
    client.expire(seqSetKey, 604800).catch(()=>{});
    client.expire(seqBinSetKey, 604800).catch(()=>{});
  }
}

async function getSequencedRange(beginSeq, endSeq) {
  const date = today();
  const seqSetKey = `${prefix}:${date}:seq`;
  // Read using ZRANGEBYSCORE (zRange in modern node-redis with BY_SCORE)
  const results = await client.zRange(seqSetKey, beginSeq, endSeq, { BY: 'SCORE' });
  return results; // Array of JSON strings
}

function getPipeline() {
  return client.multi();
}

async function executePipeline(multiPipeline) {
  const date = today();
  const seqSetKey = `${prefix}:${date}:seq`;
  const seqBinSetKey = `${prefix}:${date}:seqbin`;

  await multiPipeline.exec();

  client.expire(seqSetKey, 604800).catch(()=>{});
  client.expire(seqBinSetKey, 604800).catch(()=>{});
}

module.exports = {
  client,
  connect,
  disconnect,
  today,
  storeLoginAccepted,
  storeLoginRejected,
  storeEndOfSession,
  storeSequencedMessage,
  getSequencedRange,
  getPipeline,
  executePipeline
};

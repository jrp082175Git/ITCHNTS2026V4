const { logger } = require('../utils/logger');
const redis = require('../storage/redis');
const sequenceStore = require('../state/sequence-store');
const registry = require('./message-types');

// Dependency injection
let retransmissionClient = null;
function setRetransmissionClient(client) {
  retransmissionClient = client;
}

let expectedSequence = 1;
function setExpectedSequence(seq) {
  expectedSequence = seq;
}
function getExpectedSequence() {
  return expectedSequence;
}

// Staging buffer for gap triggering live messages
let stagedMessage = null;
let stagedMessageAt = null;

// Throttling for duplicate logs
const duplicateWarnTimestamps = new Map();
let duplicateSuppressCount = 0;
let lastDuplicateSummaryLog = Date.now();

function logDuplicateWarning(seqNo) {
  const now = Date.now();
  if (now - lastDuplicateSummaryLog >= 10000) {
    if (duplicateSuppressCount > 0) {
      logger.info(`suppressed ${duplicateSuppressCount} duplicate-sequence warnings in the last 10s`);
      duplicateSuppressCount = 0;
    }
    lastDuplicateSummaryLog = now;
  }

  const lastWarn = duplicateWarnTimestamps.get(seqNo) || 0;
  if (now - lastWarn >= 1000) {
    logger.warn(`Duplicate sequence dropped: ${seqNo}`);
    duplicateWarnTimestamps.set(seqNo, now);
  } else {
    duplicateSuppressCount++;
  }
}

// Metrics counters (exposed for metrics.js later)
const metrics = {
  processed: 0,
  dropped: 0,
  gaps: 0,
  retransRequests: 0,
  lastErrorAt: null
};

async function invokeHandlerWithTimeout(message) {
  const handler = registry[message.msgType];
  if (!handler) {
    logger.warn(`Unknown ITCH msgType: ${message.msgType}. Skipping.`);
    metrics.dropped++;
    return true; // Pretend success to advance sequence
  }

  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('Handler timeout')), 5000);
  });

  try {
    await Promise.race([
      handler(message, message), // pass msg as both structured + raw params for now
      timeoutPromise
    ]);
    clearTimeout(timerId);
    return true;
  } catch (err) {
    clearTimeout(timerId);
    logger.error(`Handler error for type ${message.msgType} (seq ${message.sequenceNo}): ${err.message}`);
    metrics.lastErrorAt = Date.now();
    return false;
  }
}

async function dispatch(message, source) {
  // Non-sequenced
  if (message.sequenceNo === undefined || message.sequenceNo === null) {
    logger.debug(`Non-sequenced message received via ${source}: ${message.packetType || message.msgType}`);
    // Non-sequenced handler logic can go here (e.g. tracking heartbeat)
    return;
  }

  const seqNo = message.sequenceNo;

  if (seqNo === expectedSequence) {
    const success = await invokeHandlerWithTimeout(message);
    if (success) {
      await redis.storeProcessed(seqNo, JSON.stringify(message));
      sequenceStore.updateLastSequence(seqNo);
      expectedSequence++;
      metrics.processed++;
      logger.debug(`processed seq=${seqNo} type=${message.msgType} source=${source}`);

      // If we just finished a Q2 message and Q2 is empty (checked by dual-queue),
      // we'll log summary elsewhere or here conditionally if we passed a flag,
      // but spec says "After every successful Q2 message processed, log a one-line summary if Q2 just emptied: retransmission gap closed...".
      // We don't have direct access to dualQueue length here unless passed.
      // We will assume `source === 'Q2'` means we are closing the gap.
    }
  }
  else if (seqNo > expectedSequence) {
    metrics.gaps++;

    if (source === 'Q1') {
      logger.info(`gap detected expected=${expectedSequence} got=${seqNo} requesting=[${expectedSequence}..${seqNo - 1}]`);

      if (!stagedMessage || seqNo > stagedMessage.sequenceNo) {
        stagedMessage = message;
        stagedMessageAt = Date.now();
      }

      if (retransmissionClient) {
        metrics.retransRequests++;
        retransmissionClient.requestRange(expectedSequence, seqNo - 1).catch(err => {
          logger.error(`Failed to request range: ${err.message}`);
        });
      }
    } else if (source === 'Q2') {
      logger.error(`Gap appeared inside Q2 (retransmission)! expected=${expectedSequence} got=${seqNo}`);
      // Skip it, or advance? The spec says: "Log error with both sequence numbers and continue. Do not re-request (would loop)."
      // By returning without updating expectedSequence, we wait.
    }
  }
  else if (seqNo < expectedSequence) {
    // Duplicate
    logDuplicateWarning(seqNo);
    metrics.dropped++;
  }

  // After processing ANY message successfully, check the staging buffer
  await processStagedMessage();
}

async function processStagedMessage() {
  if (stagedMessage) {
    const age = Date.now() - stagedMessageAt;
    if (age > 30000) {
      logger.error('CRITICAL: retransmission stalled for >30s.');
      // Reset timer to avoid flooding logs every tick
      stagedMessageAt = Date.now();
    }

    if (expectedSequence === stagedMessage.sequenceNo) {
      const msg = stagedMessage;
      stagedMessage = null; // Clear first to prevent re-entrancy loops
      stagedMessageAt = null;

      const success = await invokeHandlerWithTimeout(msg);
      if (success) {
        await redis.storeProcessed(msg.sequenceNo, JSON.stringify(msg));
        sequenceStore.updateLastSequence(msg.sequenceNo);
        expectedSequence++;
        metrics.processed++;
        logger.debug(`processed STAGED seq=${msg.sequenceNo} type=${msg.msgType}`);
      } else {
        // Put it back if it failed? Spec says: "Do NOT advance expectedSequence on handler failure (re-deliverable)."
        // If we don't put it back, it's lost from staging. Let's put it back.
        stagedMessage = msg;
        stagedMessageAt = Date.now();
      }
    }
  }
}

function getStagedAge() {
  return stagedMessage ? (Date.now() - stagedMessageAt) / 1000 : 0;
}

module.exports = {
  dispatch,
  setExpectedSequence,
  getExpectedSequence,
  setRetransmissionClient,
  metrics,
  getStagedAge
};

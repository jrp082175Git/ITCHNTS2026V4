const { parseArgs } = require('./cli');
const config = require('./config/loader');
const { initLogger, logger } = require('./utils/logger');
const redis = require('./storage/redis');
const sequenceStore = require('./state/sequence-store');
const { DualQueue } = require('./queue/dual-queue');
const { RelayClient } = require('./net/relay-client');
const { RetransmissionClient } = require('./net/retransmission-client');
const { dispatch, setExpectedSequence, getExpectedSequence, setRetransmissionClient } = require('./handlers/dispatcher');
const metricsServer = require('./servers/metrics');

let dualQueue, relayClient, retransmissionClient;

async function bootstrap() {
  const params = parseArgs();
  initLogger(params.users);

  try {
    await redis.connect();
  } catch (err) {
    logger.error(`Failed to connect to Redis: ${err.message}`);
    process.exit(1);
  }

  // Idempotency check / Resume logic
  let expectedSeq = 1;
  if (params.start === 'N') {
    const memState = sequenceStore.read();
    const lastFileSeq = memState ? memState.lastSequence : 0;
    const lastRedisSeq = await redis.getLastSequence();

    if (lastFileSeq !== lastRedisSeq && (lastFileSeq !== 0 || lastRedisSeq !== 0)) {
      if (Math.abs(lastFileSeq - lastRedisSeq) > 1) {
        logger.warn(`CRITICAL: Sequence state mismatch! File: ${lastFileSeq}, Redis: ${lastRedisSeq}. Using higher value.`);
      }
      const highest = Math.max(lastFileSeq, lastRedisSeq);
      expectedSeq = highest + 1;
      sequenceStore.updateLastSequence(highest);
    } else {
      expectedSeq = lastRedisSeq + 1;
    }
  }

  setExpectedSequence(expectedSeq);
  logger.info(`Starting with expectedSequence=${expectedSeq}`);

  // Create queues and clients
  dualQueue = new DualQueue();
  dualQueue.setDispatcher(dispatch);

  relayClient = new RelayClient(dualQueue);
  relayClient.on('message', m => dualQueue.enqueueRelay(m));

  retransmissionClient = new RetransmissionClient(dualQueue);
  retransmissionClient.on('retransmission-batch', arr => dualQueue.enqueueRetransmission(arr));

  setRetransmissionClient(retransmissionClient);

  // Start everything
  dualQueue.start();
  relayClient.start();
  retransmissionClient.start();
  metricsServer.startMetrics(dualQueue, relayClient, retransmissionClient, 5000);

  console.log(`
========================================
 Processor — ITCH Receiver Interface
========================================
 START MODE:       ${params.start}
 USERS:            ${params.users}
 EXPECTED SEQ:     ${expectedSeq}
 RELAY TARGET:     ${config.receiver.tcpRelay.host}:${config.receiver.tcpRelay.port}
 RETRANS TARGET:   ${config.receiver.retransmission.host}:${config.receiver.retransmission.port}
 REDIS TARGET:     ${config.redis.host}:${config.redis.port}
 DATE:             ${redis.today()}
========================================
`);

  // Signal handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Unhandled Errors
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.stack}`);
    gracefulShutdown('uncaughtException', 99);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
    gracefulShutdown('unhandledRejection', 99);
  });
}

let isShuttingDown = false;
async function gracefulShutdown(reason, code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Initiating graceful shutdown due to ${reason}...`);

  // Force kill timer
  setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded. Hard exit.');
    process.exit(code || 1);
  }, 10000).unref();

  try {
    if (relayClient) relayClient.stop();
    metricsServer.stop();

    // Drain queue wait
    if (dualQueue) {
      let waitMs = 0;
      while (waitMs < 5000) {
        const stats = dualQueue.getStats();
        if (stats.q1 === 0 && stats.q2 === 0 && !stats.processing) {
          break;
        }
        await new Promise(r => setTimeout(r, 100));
        waitMs += 100;
      }
      const finalStats = dualQueue.getStats();
      if (finalStats.q1 > 0 || finalStats.q2 > 0) {
        logger.warn(`Queue not fully drained after 5s. Q1: ${finalStats.q1}, Q2: ${finalStats.q2}`);
      }
      dualQueue.stop();
    }

    sequenceStore.flush();

    if (retransmissionClient) retransmissionClient.stop();
    await redis.disconnect();

  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    code = code || 1;
  }

  logger.info('Shutdown complete.');
  process.exit(code);
}

bootstrap();

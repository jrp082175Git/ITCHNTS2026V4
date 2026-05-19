const { parseArgs } = require('./cli');
const config = require('./config/loader');
const { initLogger, logger } = require('./utils/logger');
const { HOST_ENDIAN } = require('./utils/endian');
const redis = require('./storage/redis');
const socketIoServer = require('./servers/socketio');
const tcpRelayServer = require('./servers/tcp-relay');
const retransmissionServer = require('./servers/retransmission');
const sessionStore = require('./state/session-store');
const { ItchClient } = require('./net/itch-client');
// Optional metrics
const metricsServer = require('./servers/metrics');

let itchClient;

async function bootstrap() {
  const params = parseArgs(); // Will exit if invalid
  initLogger(params.users);

  // Connect Redis
  try {
    await redis.connect();
  } catch (err) {
    logger.error(`Failed to connect to Redis: ${err.message}`);
    process.exit(1);
  }

  // Determine today's set size to log sanity check
  try {
    const today = redis.today();
    const prefix = config.redis.keyPrefix || 'ITCH';
    const count = await redis.client.zCard(`${prefix}:${today}:seq`);
    logger.info(`Redis Seq Sorted Set cardinality for today: ${count}`);
  } catch (e) {
    logger.warn('Could not read sequence cardinality on startup.');
  }

  // Start Downstream Servers
  const io = socketIoServer.startSocketIo();
  tcpRelayServer.startTcpRelay();
  retransmissionServer.startRetransmission();
  metricsServer.startMetrics();

  // Handle Session Resumption
  let session = '';
  let sequence = 1;

  if (params.start === 'N') {
    const state = sessionStore.read();
    if (state) {
      session = state.sessionId;
      sequence = state.lastSequence + 1;
      logger.info(`Resuming session: ${session}, starting seq: ${sequence}`);
    } else {
      logger.warn('START=N requested but no state found. Fresh login.');
    }
  } else {
    logger.info('Fresh login requested.');
  }

  // Context factory for client
  const getContext = () => ({
    io,
    tcpRelay: tcpRelayServer
  });

  // Start ITCH Client
  itchClient = new ItchClient(params.env, params.start, getContext);
  itchClient.connect(session, sequence);

  // Print Banner
  const itchConfig = params.env === 'PROD' ? config.itch.prod : config.itch.dr;
  console.log(`
========================================
 PSE ITCH Server Feed Receiver
========================================
 ENV:          ${params.env}
 START MODE:   ${params.start}
 USERS:        ${params.users}
 TARGET:       ${itchConfig.host}:${itchConfig.port}
 REDIS:        ${config.redis.host}:${config.redis.port}
 ENDIANNESS:   ${HOST_ENDIAN}
 DATE:         ${redis.today()}
 LISTENING ON: Socket.IO (${config.servers.socketIo.port}), TCP Relay (${config.servers.tcpRelay.port}), Retransmission (${config.servers.retransmission.port})
========================================
`);

  // Signal handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Redact function
  function redact(str) {
    if (!str) return str;
    const pwdProd = config.itch.prod ? config.itch.prod.password : null;
    const pwdDr = config.itch.dr ? config.itch.dr.password : null;
    let out = String(str);
    if (pwdProd && pwdProd !== 'PWDPRD') out = out.split(pwdProd).join('********');
    if (pwdDr && pwdDr !== 'PWDDR') out = out.split(pwdDr).join('********');
    return out;
  }

  // Unhandled Errors
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${redact(err.stack)}`);
    gracefulShutdown('uncaughtException', 99);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${redact(reason)}`);
    gracefulShutdown('unhandledRejection', 99);
  });
}

let isShuttingDown = false;
async function gracefulShutdown(reason, code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Initiating graceful shutdown due to ${reason}...`);

  try {
    // Broadcast shutdown type Z equivalent
    const shutdownMsg = JSON.stringify({ packetType: 'SHUTDOWN', reason });
    socketIoServer.broadcast('itch', { packetType: 'SHUTDOWN', reason });
    tcpRelayServer.broadcast(shutdownMsg);

    socketIoServer.stop();
    tcpRelayServer.stop();
    retransmissionServer.stop();
    metricsServer.stop();

    // Sync session state to disk if memory differs
    const memState = sessionStore.read();
    if (memState) {
      sessionStore.write(memState);
    }

    if (itchClient) {
      await itchClient.logoutAndClose();
    }

    // Give Redis pipeline a moment to drain
    await new Promise(r => setTimeout(r, 1000));
    await redis.disconnect();

  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    code = code || 1;
  }

  logger.info('Shutdown complete.');
  setTimeout(() => process.exit(code), 500).unref(); // Ensure we exit
}

bootstrap();

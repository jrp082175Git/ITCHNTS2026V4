const net = require('net');
const config = require('../config/loader');
const { logger } = require('../utils/logger');
const { SoupBinFramer } = require('../parsers/soupbin-framer');
const { decodeType, SERVER } = require('../parsers/soupbin-packets');
const { buildLoginRequest, buildLogoutRequest } = require('../parsers/build-login');
const { HeartbeatManager } = require('./client-heartbeat');

// Handlers
const { handleLoginAccepted } = require('../handlers/login-accepted');
const { handleLoginRejected } = require('../handlers/login-rejected');
const { handleSequencedData } = require('../handlers/sequenced');
const { handleServerHeartbeat } = require('../handlers/heartbeat');
const { handleEndOfSession } = require('../handlers/end-of-session');

class ItchClient {
  constructor(env, startMode, getDownstreamContext) {
    this.envConfig = env === 'PROD' ? config.itch.prod : config.itch.dr;
    this.startMode = startMode;
    this.getDownstreamContext = getDownstreamContext;

    this.socket = null;
    this.framer = null;
    this.heartbeatMgr = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.isShuttingDown = false;
  }

  connect(session, sequence) {
    this.socket = new net.Socket();
    this.socket.setNoDelay(true);

    this.framer = new SoupBinFramer();
    this.heartbeatMgr = new HeartbeatManager(this.socket);

    this.socket.on('connect', () => {
      logger.info(`Connected to ITCH ${this.envConfig.host}:${this.envConfig.port}`);
      this.reconnectAttempt = 0;

      const loginBuf = buildLoginRequest({
        username: this.envConfig.username,
        password: this.envConfig.password,
        session,
        sequence
      });

      this.send(loginBuf);
      this.heartbeatMgr.start();
    });

    this.socket.on('data', (chunk) => {
      this.heartbeatMgr.updateRecv();
      this.framer.feed(chunk);
    });

    this.framer.on('packet', async (packetBuffer) => {
      const type = decodeType(packetBuffer);
      const { io, tcpRelay } = this.getDownstreamContext();

      switch (type) {
        case SERVER.LOGIN_ACCEPTED:
          await handleLoginAccepted(packetBuffer, io);
          break;
        case SERVER.LOGIN_REJECTED:
          await handleLoginRejected(packetBuffer, io);
          break;
        case SERVER.SEQUENCED:
          await handleSequencedData(packetBuffer, io, tcpRelay);
          break;
        case SERVER.HEARTBEAT:
          handleServerHeartbeat(this.socket, tcpRelay);
          break;
        case SERVER.END_OF_SESSION:
          await handleEndOfSession(packetBuffer, io);
          break;
        case SERVER.DEBUG:
        case SERVER.UNSEQUENCED:
          // Ignore debug and unsequenced per standard spec typical usage unless requested
          break;
        default:
          logger.warn(`Received unknown packet type: ${type}`);
      }
    });

    this.framer.on('error', (err) => {
      logger.error(`Framer error: ${err.message}`);
      this.socket.destroy();
    });

    this.socket.on('error', (err) => {
      logger.error(`ITCH Socket error: ${err.message}`);
    });

    this.socket.on('close', () => {
      logger.info('ITCH Socket closed.');
      this.heartbeatMgr.stop();
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });

    this.socket.connect(this.envConfig.port, this.envConfig.host);
  }

  scheduleReconnect() {
    // Exponential backoff capped at 30s
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;

    logger.info(`Reconnecting to ITCH in ${backoff}ms...`);

    this.reconnectTimer = setTimeout(() => {
      // On reconnect, we force startMode N semantics via session store
      const sessionStore = require('../state/session-store');
      const state = sessionStore.read();

      let session = '';
      let sequence = 1;

      if (state) {
        session = state.sessionId;
        sequence = state.lastSequence + 1;
      }

      this.connect(session, sequence);
    }, backoff);
  }

  send(buffer) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(buffer);
      this.heartbeatMgr.updateSend();
    }
  }

  async logoutAndClose() {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.socket && !this.socket.destroyed) {
      const logoutBuf = buildLogoutRequest();
      this.send(logoutBuf);

      // Give server a bit of time to reply/close, then force close
      await new Promise(r => setTimeout(r, 200));
      this.socket.destroy();
    }
  }
}

module.exports = { ItchClient };

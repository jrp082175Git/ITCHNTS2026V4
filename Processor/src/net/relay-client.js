const net = require('net');
const EventEmitter = require('events');
const config = require('../config/loader');
const { logger } = require('../utils/logger');

class RelayClient extends EventEmitter {
  constructor(dualQueue) {
    super();
    this.dualQueue = dualQueue;
    this.host = config.receiver.tcpRelay.host;
    this.port = config.receiver.tcpRelay.port;
    this.maxBufferBytes = 16 * 1024 * 1024; // 16 MB

    this.reconnectOpts = config.reconnect;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;

    this.socket = null;
    this.buffer = '';
    this.isShuttingDown = false;
    this.isPaused = false;
    this.backpressureCheckInterval = null;
  }

  start() {
    this.isShuttingDown = false;
    this.connect();

    // Check backpressure periodically
    this.backpressureCheckInterval = setInterval(() => this.checkBackpressure(), 100);
  }

  connect() {
    if (this.socket) {
      this.socket.destroy();
    }
    this.socket = new net.Socket();
    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true, 30000);
    this.buffer = '';

    this.socket.on('connect', () => {
      logger.info(`RelayClient connected to ${this.host}:${this.port}`);
      this.reconnectAttempt = 0;
      this.isPaused = false;
      this.emit('connected');
    });

    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');

      if (Buffer.byteLength(this.buffer, 'utf8') > this.maxBufferBytes) {
        logger.error('RelayClient line buffer overflow > 16MB. Dropping connection.');
        this.socket.destroy(new Error('Buffer overflow'));
        return;
      }

      let newlineIdx;
      while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIdx).trim();
        this.buffer = this.buffer.slice(newlineIdx + 1);

        if (!line) continue;

        try {
          const message = JSON.parse(line);
          this.emit('message', message);
        } catch (err) {
          const snippet = line.length > 256 ? line.substring(0, 256) + '...' : line;
          logger.warn(`RelayClient JSON parse error. Dropping line: ${snippet}`);
        }
      }
    });

    this.socket.on('error', (err) => {
      logger.error(`RelayClient socket error: ${err.message}`);
    });

    this.socket.on('close', () => {
      logger.info('RelayClient connection closed.');
      this.emit('disconnected');
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });

    logger.info(`RelayClient connecting to ${this.host}:${this.port}...`);
    this.socket.connect(this.port, this.host);
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    let delay = this.reconnectOpts.initialDelayMs * Math.pow(this.reconnectOpts.factor, this.reconnectAttempt);
    if (delay > this.reconnectOpts.maxDelayMs) {
      delay = this.reconnectOpts.maxDelayMs;
    }

    this.reconnectAttempt++;
    logger.info(`RelayClient reconnecting in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  checkBackpressure() {
    if (!this.socket || this.socket.destroyed) return;

    const stats = this.dualQueue.getStats();
    const maxQ1 = config.queue.maxOnQueue1;

    if (!this.isPaused && stats.q1 > maxQ1 * 0.9) {
      logger.warn(`RelayClient pausing socket: Q1 at ${stats.q1}/${maxQ1}`);
      this.socket.pause();
      this.isPaused = true;
    } else if (this.isPaused && stats.q1 < maxQ1 * 0.5) {
      logger.info(`RelayClient resuming socket: Q1 at ${stats.q1}/${maxQ1}`);
      this.socket.resume();
      this.isPaused = false;
    }
  }

  stop() {
    this.isShuttingDown = true;
    if (this.backpressureCheckInterval) {
      clearInterval(this.backpressureCheckInterval);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.socket) {
      this.socket.destroy();
    }
  }
}

module.exports = { RelayClient };

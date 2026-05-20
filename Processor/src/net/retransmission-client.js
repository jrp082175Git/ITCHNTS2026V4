const net = require('net');
const EventEmitter = require('events');
const crypto = require('crypto');
const os = require('os');
const config = require('../config/loader');
const { logger } = require('../utils/logger');
const redis = require('../storage/redis');

class RetransmissionClient extends EventEmitter {
  constructor(dualQueue) {
    super();
    this.dualQueue = dualQueue;
    this.host = config.receiver.retransmission.host;
    this.port = config.receiver.retransmission.port;
    this.maxBufferBytes = 16 * 1024 * 1024; // 16 MB

    this.reconnectOpts = config.reconnect;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;

    this.socket = null;
    this.buffer = '';
    this.isShuttingDown = false;
    this.isPaused = false;
    this.backpressureCheckInterval = null;

    this.socketID = `processor-${os.hostname()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    this.pendingRequests = [];
  }

  start() {
    this.isShuttingDown = false;
    this.connect();
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
      logger.info(`RetransmissionClient connected to ${this.host}:${this.port} as ${this.socketID}`);
      this.reconnectAttempt = 0;
      this.isPaused = false;
      this.emit('connected');
    });

    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');

      if (Buffer.byteLength(this.buffer, 'utf8') > this.maxBufferBytes) {
        logger.error('RetransmissionClient line buffer overflow > 16MB. Dropping connection.');
        this.socket.destroy(new Error('Buffer overflow'));
        return;
      }

      let newlineIdx;
      while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIdx).trim();
        this.buffer = this.buffer.slice(newlineIdx + 1);

        if (!line) continue;

        try {
          const response = JSON.parse(line);
          this.handleResponse(response);
        } catch (err) {
          const snippet = line.length > 256 ? line.substring(0, 256) + '...' : line;
          logger.warn(`RetransmissionClient JSON parse error. Dropping line: ${snippet}`);
        }
      }
    });

    this.socket.on('error', (err) => {
      logger.error(`RetransmissionClient socket error: ${err.message}`);
    });

    this.socket.on('close', () => {
      logger.info('RetransmissionClient connection closed.');
      this.emit('disconnected');

      // Reject any pending requests
      while (this.pendingRequests.length > 0) {
        const req = this.pendingRequests.shift();
        req.reject(new Error('Socket closed while waiting for retransmission'));
      }

      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });

    this.socket.connect(this.port, this.host);
  }

  handleResponse(response) {
    if (response.socketID !== this.socketID) return;

    if (response.error) {
      logger.error(`Retransmission error from server: ${response.error}`);
      if (this.pendingRequests.length > 0) {
        const req = this.pendingRequests.shift();
        req.reject(new Error(response.error));
      }
      return;
    }

    if (this.pendingRequests.length > 0) {
      const req = this.pendingRequests.shift();
      this.emit('retransmission-batch', response.messages || []);
      req.resolve();
    } else {
      logger.warn('Received retransmission response but no pending requests in queue.');
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    let delay = this.reconnectOpts.initialDelayMs * Math.pow(this.reconnectOpts.factor, this.reconnectAttempt);
    if (delay > this.reconnectOpts.maxDelayMs) {
      delay = this.reconnectOpts.maxDelayMs;
    }

    this.reconnectAttempt++;
    logger.info(`RetransmissionClient reconnecting in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  checkBackpressure() {
    if (!this.socket || this.socket.destroyed) return;

    const stats = this.dualQueue.getStats();
    const maxQ2 = config.queue.maxOnQueue2;

    if (!this.isPaused && stats.q2 > maxQ2 * 0.9) {
      logger.warn(`RetransmissionClient pausing socket: Q2 at ${stats.q2}/${maxQ2}`);
      this.socket.pause();
      this.isPaused = true;
    } else if (this.isPaused && stats.q2 < maxQ2 * 0.5) {
      logger.info(`RetransmissionClient resuming socket: Q2 at ${stats.q2}/${maxQ2}`);
      this.socket.resume();
      this.isPaused = false;
    }
  }

  async requestRange(beginningSequence, endingSequence) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Retransmission socket disconnected');
    }

    if (endingSequence < beginningSequence) {
      throw new Error('endingSequence < beginningSequence');
    }

    const maxRange = config.queue.retransmissionMaxRange;
    if (endingSequence - beginningSequence > maxRange) {
      // Split into chunks if exceeds maxRange
      for (let start = beginningSequence; start <= endingSequence; start += maxRange + 1) {
        const end = Math.min(start + maxRange, endingSequence);
        await this._issueRequest(start, end);
      }
    } else {
      await this._issueRequest(beginningSequence, endingSequence);
    }
  }

  _issueRequest(beginningSequence, endingSequence) {
    return new Promise((resolve, reject) => {
      const payload = {
        socketID: this.socketID,
        beginningSequence,
        endingSequence
      };

      const line = JSON.stringify(payload) + '\n';

      this.socket.write(line, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Log to redis for diagnostics
        redis.logRetransmissionRequest({
          beginningSequence,
          endingSequence,
          at: new Date().toISOString()
        }).catch(e => logger.warn(`Failed to log retrans req to redis: ${e.message}`));

        this.pendingRequests.push({ resolve, reject });
      });
    });
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

module.exports = { RetransmissionClient };

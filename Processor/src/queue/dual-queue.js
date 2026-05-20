const { logger } = require('../utils/logger');
const config = require('../config/loader');

class DualQueue {
  constructor() {
    this.onQueue1 = []; // Live Relay messages
    this.onQueue2 = []; // Retransmission responses

    this.maxOnQueue1 = config.queue.maxOnQueue1;
    this.maxOnQueue2 = config.queue.maxOnQueue2;

    this.processing = false;
    this.running = false;

    this.dispatcher = null;
    this.lastDequeueAt = Date.now();
  }

  setDispatcher(fn) {
    this.dispatcher = fn;
  }

  start() {
    this.running = true;
    this.drain();
  }

  stop() {
    this.running = false;
  }

  enqueueRelay(message) {
    if (this.onQueue1.length >= this.maxOnQueue1) {
      // Drop oldest
      this.onQueue1.shift();
      logger.error('DualQueue: onQueue1 overflow. Dropping oldest live message.');
    }
    this.onQueue1.push(message);
    this.drain();
  }

  enqueueRetransmission(messages) {
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      if (this.onQueue2.length >= this.maxOnQueue2) {
        this.onQueue2.shift();
        logger.error('DualQueue: onQueue2 overflow. Dropping oldest retransmission message.');
      }
      this.onQueue2.push(msg);
    }
    this.drain();
  }

  getStats() {
    return {
      q1: this.onQueue1.length,
      q2: this.onQueue2.length,
      processing: this.processing,
      lastDequeueAt: this.lastDequeueAt
    };
  }

  drain() {
    if (!this.running || this.processing) return;

    setImmediate(async () => {
      // Re-entrancy check again inside the tick
      if (!this.running || this.processing) return;
      this.processing = true;

      try {
        while (this.running) {
          // Priority 1: Queue 2
          if (this.onQueue2.length > 0) {
            const msg = this.onQueue2.shift();
            this.lastDequeueAt = Date.now();
            await this.dispatcher(msg, 'Q2');
            continue;
          }

          // Priority 2: Queue 1
          if (this.onQueue1.length > 0) {
            const msg = this.onQueue1.shift();
            this.lastDequeueAt = Date.now();
            await this.dispatcher(msg, 'Q1');
            continue;
          }

          // Both empty
          break;
        }
      } catch (err) {
        logger.error(`DualQueue unhandled dispatcher error: ${err.message}`);
      } finally {
        this.processing = false;

        // Edge case: something arrived while we were finishing up the finally block
        if (this.onQueue1.length > 0 || this.onQueue2.length > 0) {
          this.drain();
        }
      }
    });
  }
}

module.exports = { DualQueue };

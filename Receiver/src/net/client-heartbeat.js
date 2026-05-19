const { buildClientHeartbeat } = require('../parsers/build-login');
const config = require('../config/loader');

class HeartbeatManager {
  constructor(socket) {
    this.socket = socket;
    this.clientIntervalMs = config.heartbeat.clientIntervalMs || 1000;
    this.serverTimeoutMs = config.heartbeat.serverTimeoutMs || 15000;

    this.lastSendAt = Date.now();
    this.lastRecvAt = Date.now();

    this.intervalId = null;
  }

  start() {
    this.lastSendAt = Date.now();
    this.lastRecvAt = Date.now();

    if (this.intervalId) clearInterval(this.intervalId);

    // We run the tick frequently enough to catch the 1-second boundary accurately
    this.intervalId = setInterval(() => this.tick(), 250);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updateSend() {
    this.lastSendAt = Date.now();
  }

  updateRecv() {
    this.lastRecvAt = Date.now();
  }

  tick() {
    const now = Date.now();

    // Server silence watchdog
    if (now - this.lastRecvAt >= this.serverTimeoutMs) {
      console.error(`[Heartbeat] Server silent for ${this.serverTimeoutMs}ms. Dropping connection.`);
      this.socket.destroy(new Error('Server silence timeout'));
      return;
    }

    // Client heartbeat
    if (now - this.lastSendAt >= this.clientIntervalMs) {
      const hbBuf = buildClientHeartbeat();
      if (!this.socket.destroyed) {
        this.socket.write(hbBuf);
        this.updateSend();
      }
    }
  }
}

module.exports = { HeartbeatManager };

const net = require('net');
const { logger } = require('../utils/logger');
const config = require('../config/loader');

const clients = new Set();
let server;

function startTcpRelay() {
  const port = config.servers.tcpRelay.port;

  server = net.createServer((socket) => {
    logger.info(`TCP Relay client connected: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);

    clients.add(socket);

    socket.on('error', (err) => {
      logger.warn(`TCP Relay client error (${socket.remoteAddress}): ${err.message}`);
    });

    socket.on('close', () => {
      logger.info(`TCP Relay client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
      clients.delete(socket);
    });
  });

  server.listen(port, () => {
    logger.info(`TCP Relay server listening on port ${port}`);
  });

  return server;
}

function broadcast(jsonString) {
  if (clients.size === 0) return;

  const payloadBuf = Buffer.from(jsonString + '\n');
  const MAX_WRITABLE_LENGTH = 1024 * 1024; // 1 MB

  for (const socket of clients) {
    if (socket.writableLength > MAX_WRITABLE_LENGTH) {
      logger.warn(`TCP Relay slow consumer detected (${socket.remoteAddress}). Dropping connection.`);
      socket.destroy(new Error('Slow consumer'));
      clients.delete(socket);
      continue;
    }

    // Backpressure: Only write if socket allows.
    // If it returns false, Node buffers it until 'drain', but since we check
    // writableLength above, we're protected against unbounded buffering.
    const canWrite = socket.write(payloadBuf);
    if (!canWrite) {
      // In a more complex setup we might pause emitting to this socket,
      // but capping writableLength handles the safety.
    }
  }
}

function getClients() {
  return clients;
}

function stop() {
  for (const socket of clients) {
    socket.destroy();
  }
  clients.clear();
  if (server) {
    server.close();
  }
}

module.exports = {
  startTcpRelay,
  broadcast,
  getClients,
  stop
};

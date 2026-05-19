const http = require('http');
const config = require('../config/loader');
const { logger } = require('../utils/logger');
const redis = require('../storage/redis');
const socketIoServer = require('./socketio');
const tcpRelayServer = require('./tcp-relay');

let server;

function startMetrics() {
  const port = config.servers.metrics.port;
  if (!port) return null; // Disabled if not in config

  server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') {
      try {
        // Simple ping to Redis
        await redis.client.ping();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Unavailable');
      }
    } else if (req.url === '/metrics') {
      const ioClients = socketIoServer.connectedClientCount();
      const relayClients = tcpRelayServer.getClients().size;

      let redisConnected = 0;
      if (redis.client && redis.client.isOpen) {
        redisConnected = 1;
      }

      const metrics = `
# HELP relay_clients_gauge Number of connected TCP relay clients
# TYPE relay_clients_gauge gauge
relay_clients_gauge ${relayClients}

# HELP socketio_clients_gauge Number of connected Socket.IO clients
# TYPE socketio_clients_gauge gauge
socketio_clients_gauge ${ioClients}

# HELP redis_connected_gauge 1 if connected to Redis, 0 otherwise
# TYPE redis_connected_gauge gauge
redis_connected_gauge ${redisConnected}
`;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    logger.info(`Metrics server listening on port ${port}`);
  });

  return server;
}

function stop() {
  if (server) {
    server.close();
  }
}

module.exports = {
  startMetrics,
  stop
};

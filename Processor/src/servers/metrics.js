const http = require('http');
const { logger } = require('../utils/logger');
const redis = require('../storage/redis');
const { metrics: dispatcherMetrics, getStagedAge, getExpectedSequence } = require('../handlers/dispatcher');
const sequenceStore = require('../state/sequence-store');

let server;

function startMetrics(dualQueue, relayClient, retransmissionClient, port = 5000) {
  server = http.createServer(async (req, res) => {
    // Basic healthcheck
    if (req.url === '/healthz') {
      try {
        await redis.client.ping();
        const relayOk = relayClient.socket && !relayClient.socket.destroyed;
        const retransOk = retransmissionClient.socket && !retransmissionClient.socket.destroyed;

        if (relayOk && retransOk) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('OK');
        } else {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('Disconnected from upstream receivers');
        }
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Redis Unavailable');
      }
      return;
    }

    if (req.url === '/metrics') {
      const qStats = dualQueue.getStats();
      const relayConnected = (relayClient.socket && !relayClient.socket.destroyed) ? 1 : 0;
      const retransConnected = (retransmissionClient.socket && !retransmissionClient.socket.destroyed) ? 1 : 0;

      const metrics = `
# HELP processor_messages_processed_total Number of messages successfully processed
# TYPE processor_messages_processed_total counter
processor_messages_processed_total ${dispatcherMetrics.processed}

# HELP processor_messages_dropped_total Number of messages dropped
# TYPE processor_messages_dropped_total counter
processor_messages_dropped_total ${dispatcherMetrics.dropped}

# HELP processor_gaps_detected_total Number of gaps detected
# TYPE processor_gaps_detected_total counter
processor_gaps_detected_total ${dispatcherMetrics.gaps}

# HELP processor_retransmission_requests_total Number of retransmission requests issued
# TYPE processor_retransmission_requests_total counter
processor_retransmission_requests_total ${dispatcherMetrics.retransRequests}

# HELP processor_q1_depth Current depth of live queue 1
# TYPE processor_q1_depth gauge
processor_q1_depth ${qStats.q1}

# HELP processor_q2_depth Current depth of retransmission queue 2
# TYPE processor_q2_depth gauge
processor_q2_depth ${qStats.q2}

# HELP processor_expected_sequence The sequence number the dispatcher is currently waiting for
# TYPE processor_expected_sequence gauge
processor_expected_sequence ${getExpectedSequence()}

# HELP processor_last_processed_sequence The highest sequence number successfully saved
# TYPE processor_last_processed_sequence gauge
processor_last_processed_sequence ${sequenceStore.getLastSequence()}

# HELP processor_staged_message_age_seconds Age of the message stuck in the staging buffer
# TYPE processor_staged_message_age_seconds gauge
processor_staged_message_age_seconds ${getStagedAge()}

# HELP processor_relay_connected Connection status to live TCP relay
# TYPE processor_relay_connected gauge
processor_relay_connected ${relayConnected}

# HELP processor_retransmission_connected Connection status to retransmission server
# TYPE processor_retransmission_connected gauge
processor_retransmission_connected ${retransConnected}
`;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
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

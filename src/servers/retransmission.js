const net = require('net');
const { logger } = require('../utils/logger');
const config = require('../config/loader');
const redis = require('../storage/redis');

let server;

function startRetransmission() {
  const port = config.servers.retransmission.port;

  server = net.createServer((socket) => {
    logger.info(`Retransmission client connected: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.setNoDelay(true);

    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString('utf8');

      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        try {
          const req = JSON.parse(line);
          await handleRequest(socket, req);
        } catch (err) {
          logger.error(`Retransmission invalid JSON from ${socket.remoteAddress}: ${line}`);
          socket.write(JSON.stringify({ socketID: null, error: 'invalid JSON' }) + '\n');
        }
      }
    });

    socket.on('error', (err) => {
      logger.warn(`Retransmission client error (${socket.remoteAddress}): ${err.message}`);
    });
  });

  server.listen(port, () => {
    logger.info(`Retransmission server listening on port ${port}`);
  });

  return server;
}

async function handleRequest(socket, req) {
  const { socketID, beginningSequence, endingSequence } = req;

  if (!socketID) {
    socket.write(JSON.stringify({ error: 'Missing socketID' }) + '\n');
    return;
  }

  if (!Number.isInteger(beginningSequence) || !Number.isInteger(endingSequence) || endingSequence < beginningSequence) {
    socket.write(JSON.stringify({ socketID, error: 'Invalid sequence range' }) + '\n');
    return;
  }

  const MAX_RANGE = 100000;
  if (endingSequence - beginningSequence > MAX_RANGE) {
    socket.write(JSON.stringify({ socketID, error: `Range exceeds max allowed of ${MAX_RANGE}` }) + '\n');
    return;
  }

  try {
    const rawJsonStrings = await redis.getSequencedRange(beginningSequence, endingSequence);

    // We have an array of JSON strings, we need to parse them to embed in the array
    // Or we could construct the JSON response manually to save CPU:
    // { "socketID": "...", "messages": [ string1, string2 ] }
    const arrayStr = `[${rawJsonStrings.join(',')}]`;

    const response = `{"socketID":"${socketID}","messages":${arrayStr}}\n`;
    socket.write(response);

    logger.info(`Retransmitted ${rawJsonStrings.length} messages for seq ${beginningSequence}-${endingSequence}`);
  } catch (err) {
    logger.error(`Retransmission Redis error: ${err.message}`);
    socket.write(JSON.stringify({ socketID, error: 'Internal server error' }) + '\n');
  }
}

function stop() {
  if (server) {
    server.close();
  }
}

module.exports = {
  startRetransmission,
  stop
};

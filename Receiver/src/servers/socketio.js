const { Server } = require('socket.io');
const { logger } = require('../utils/logger');
const config = require('../config/loader');

let io;

function startSocketIo() {
  const port = config.servers.socketIo.port;
  io = new Server({
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket.IO client connected: ${socket.id} from ${socket.handshake.address}`);

    socket.on('disconnect', (reason) => {
      logger.info(`Socket.IO client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  io.listen(port);
  logger.info(`Socket.IO server listening on port ${port}`);

  return io;
}

function broadcast(eventName, jsonObject) {
  if (io) {
    io.emit(eventName, jsonObject);
  }
}

function connectedClientCount() {
  return io ? io.engine.clientsCount : 0;
}

function stop() {
  if (io) {
    io.close();
  }
}

module.exports = {
  startSocketIo,
  broadcast,
  connectedClientCount,
  stop
};

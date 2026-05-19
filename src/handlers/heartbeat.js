const { buildClientHeartbeat } = require('../parsers/build-login');
const sessionStore = require('../state/session-store');

function handleServerHeartbeat(itchSocket, tcpRelay) {
  // Respond immediately per SoupBinTCP 1.3
  const replyBuf = buildClientHeartbeat();
  itchSocket.write(replyBuf);

  // Get last stored sequence
  const state = sessionStore.read();
  const lastStoredSequence = state ? state.lastSequence : 0;

  const jsonObject = {
    packetType: 'R', // Using R internally for relayed heartbeat status
    sequenceNo: lastStoredSequence
  };

  const jsonString = JSON.stringify(jsonObject);

  if (tcpRelay) {
    tcpRelay.broadcast(jsonString);
  }
}

module.exports = {
  handleServerHeartbeat
};

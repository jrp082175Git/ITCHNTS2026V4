const SERVER = {
  DEBUG: '+',
  LOGIN_ACCEPTED: 'A',
  LOGIN_REJECTED: 'J',
  SEQUENCED: 'S',
  UNSEQUENCED: 'U',
  HEARTBEAT: 'H',
  END_OF_SESSION: 'Z'
};

const CLIENT = {
  DEBUG: '+',
  LOGIN_REQUEST: 'L',
  UNSEQUENCED: 'U',
  HEARTBEAT: 'R',
  LOGOUT: 'O'
};

function decodeType(packetBuffer) {
  // Offset 0 and 1 are length. Offset 2 is the packet type char.
  if (packetBuffer.length < 3) return null;
  return String.fromCharCode(packetBuffer[2]);
}

module.exports = {
  SERVER,
  CLIENT,
  decodeType
};

const { CLIENT } = require('./soupbin-packets');

function buildLoginRequest({ username, password, session, sequence }) {
  // Length: 47 payload + 1 type = 48? The prompt says "47 (1 type + 46 payload)"
  // Let's verify lengths:
  // Type: 1 byte
  // Username: 6 bytes
  // Password: 10 bytes
  // Session: 10 bytes
  // Sequence: 20 bytes
  // 1 + 6 + 10 + 10 + 20 = 47. Length = 47. Total bytes = 49 (2 bytes length + 47).
  const packetLength = 47;
  const buf = Buffer.alloc(2 + packetLength);

  // 0: length
  buf.writeUInt16BE(packetLength, 0);
  // 2: type
  buf.write(CLIENT.LOGIN_REQUEST, 2, 1, 'ascii');

  // Username: 6 bytes, right padded
  const unameStr = (username || '').substring(0, 6).padEnd(6, ' ');
  buf.write(unameStr, 3, 6, 'ascii');

  // Password: 10 bytes, right padded
  const pwdStr = (password || '').substring(0, 10).padEnd(10, ' ');
  buf.write(pwdStr, 9, 10, 'ascii');

  // Session: 10 bytes, left padded (if resuming) or spaces (if fresh)
  // Let's assume if session is '' or null, we use spaces
  let sessStr = (session || '').substring(0, 10);
  if (sessStr === '') {
    sessStr = ''.padEnd(10, ' ');
  } else {
    sessStr = sessStr.padStart(10, ' ');
  }
  buf.write(sessStr, 19, 10, 'ascii');

  // Sequence: 20 bytes, numeric ASCII, left padded
  // sequence parameter is Number.
  const seqStr = String(sequence).padStart(20, ' ');
  buf.write(seqStr, 29, 20, 'ascii');

  return buf;
}

function buildClientHeartbeat() {
  const buf = Buffer.alloc(3);
  buf.writeUInt16BE(1, 0); // length 1
  buf.write(CLIENT.HEARTBEAT, 2, 1, 'ascii'); // 'R'
  return buf;
}

function buildLogoutRequest() {
  const buf = Buffer.alloc(3);
  buf.writeUInt16BE(1, 0); // length 1
  buf.write(CLIENT.LOGOUT, 2, 1, 'ascii'); // 'O'
  return buf;
}

module.exports = {
  buildLoginRequest,
  buildClientHeartbeat,
  buildLogoutRequest
};

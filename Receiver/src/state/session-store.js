const fs = require('fs');
const path = require('path');
const config = require('../config/loader');

const stateFile = config.session.stateFile || './state/session.json';
let memState = { sessionId: '', lastSequence: 0 };
let lastWriteTime = 0;
let writePending = false;

function read() {
  try {
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf8');
      memState = JSON.parse(data);
      return memState;
    }
  } catch (err) {
    console.error(`Failed to read session state from ${stateFile}: ${err.message}`);
  }
  return null;
}

function write({ sessionId, lastSequence }) {
  memState.sessionId = sessionId;
  memState.lastSequence = lastSequence;
  memState.updatedAt = new Date().toISOString();

  // Ensure directory exists
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write
  const tmpFile = `${stateFile}.tmp`;
  const data = JSON.stringify(memState);

  fs.writeFileSync(tmpFile, data, 'utf8');
  // fsync syncs it to disk but typical node just renames after writeFileSync
  fs.renameSync(tmpFile, stateFile);
  lastWriteTime = Date.now();
  writePending = false;
}

function updateLastSequence(seq) {
  memState.lastSequence = seq;
  memState.updatedAt = new Date().toISOString();

  if (!writePending) {
    const now = Date.now();
    const delay = Math.max(0, 250 - (now - lastWriteTime));

    writePending = true;
    setTimeout(() => {
      write(memState);
    }, delay);
  }
}

module.exports = {
  read,
  write,
  updateLastSequence
};

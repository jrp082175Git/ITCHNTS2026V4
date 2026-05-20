const fs = require('fs');
const path = require('path');
const config = require('../config/loader');

const stateFile = config.state.stateFile || './state/processor-state.json';
let memState = { lastSequence: 0, updatedAt: null };
let lastWriteTime = 0;
let writePending = false;
let timeoutId = null;

function read() {
  try {
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf8');
      memState = JSON.parse(data);
      return memState;
    }
  } catch (err) {
    console.error(`Failed to read sequence state from ${stateFile}: ${err.message}`);
  }
  return null;
}

function write(stateObj) {
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpFile = `${stateFile}.tmp`;
  const data = JSON.stringify(stateObj);

  fs.writeFileSync(tmpFile, data, 'utf8');
  fs.renameSync(tmpFile, stateFile);

  lastWriteTime = Date.now();
  writePending = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function updateLastSequence(seq) {
  memState.lastSequence = seq;
  memState.updatedAt = new Date().toISOString();

  if (!writePending) {
    const now = Date.now();
    const delay = Math.max(0, 250 - (now - lastWriteTime));

    writePending = true;
    timeoutId = setTimeout(() => {
      write(memState);
    }, delay);
  }
}

function flush() {
  write(memState);
}

function getLastSequence() {
  return memState.lastSequence;
}

module.exports = {
  read,
  updateLastSequence,
  flush,
  getLastSequence
};

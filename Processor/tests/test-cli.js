const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

test('CLI - Missing args exits with code 1', () => {
  const index = path.join(__dirname, '../src/index.js');
  const res = spawnSync('node', [index]);
  assert.equal(res.status, 1, 'Should exit 1 on missing args');
});

// Since the CLI parser invokes process.exit directly, unit testing the module directly
// without mocking process is messy. Spawn testing is effective.

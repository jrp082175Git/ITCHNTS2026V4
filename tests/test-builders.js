const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildLoginRequest } = require('../src/parsers/build-login');

test('Login Request Builder', () => {
  const buf = buildLoginRequest({
    username: 'USR',
    password: 'PWD',
    session: 'SESSION',
    sequence: 123
  });

  assert.equal(buf.length, 49, 'Total buffer length should be 49');
  assert.equal(buf.readUInt16BE(0), 47, 'Packet length should be 47');
  assert.equal(String.fromCharCode(buf[2]), 'L', 'Type should be L');

  const uname = buf.toString('ascii', 3, 9);
  assert.equal(uname, 'USR   ', 'Username padded right to 6');

  const pwd = buf.toString('ascii', 9, 19);
  assert.equal(pwd, 'PWD       ', 'Password padded right to 10');

  const sess = buf.toString('ascii', 19, 29);
  assert.equal(sess, '   SESSION', 'Session padded left to 10');

  const seq = buf.toString('ascii', 29, 49);
  assert.equal(seq, '                 123', 'Sequence padded left to 20');
});

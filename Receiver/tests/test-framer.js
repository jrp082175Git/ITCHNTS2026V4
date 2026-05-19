const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SoupBinFramer } = require('../src/parsers/soupbin-framer');

test('SoupBinFramer - cleanly framed packet', (t) => {
  return new Promise((resolve) => {
    const framer = new SoupBinFramer();
    const packet = Buffer.from([0x00, 0x01, 0x4C]); // Length 1, Type 'L'

    framer.on('packet', (buf) => {
      assert.deepEqual(buf, packet);
      resolve();
    });

    framer.feed(packet);
  });
});

test('SoupBinFramer - pathological split', (t) => {
  return new Promise((resolve) => {
    const framer = new SoupBinFramer();
    const packet = Buffer.from([0x00, 0x01, 0x4C]);

    let received = null;
    framer.on('packet', (buf) => {
      received = buf;
      assert.deepEqual(buf, packet);
      resolve();
    });

    // Feed byte by byte
    framer.feed(packet.subarray(0, 1));
    framer.feed(packet.subarray(1, 2));
    framer.feed(packet.subarray(2, 3));
  });
});

const { logger } = require('../utils/logger');

// ITCH parsing helpers
function readAlpha(buf, offset, length) {
  return buf.toString('latin1', offset, offset + length).trimEnd();
}

function readPrice(buf, offset) {
  // Reads 8-byte signed BE int. We use BigInt to avoid precision loss.
  // The caller divides by 10^decimalsInPrice later
  return buf.readBigInt64BE(offset).toString();
}

function readDate(buf, offset) {
  // 4-byte int -> string YYYYMMDD
  return buf.readInt32BE(offset).toString();
}

// Per-type parsers
function parseSecondsMessage(buf) {
  return {
    msgType: 'T',
    seconds: buf.readUInt32BE(1)
  };
}

function parseOrderBookDirectory(buf) {
  return {
    msgType: 'R',
    nanos: buf.readInt32BE(1),
    orderBookId: buf.readInt32BE(5),
    symbol: readAlpha(buf, 9, 16),
    isin: readAlpha(buf, 25, 12),
    financialProduct: buf.readInt32BE(37),
    tradingCurrency: readAlpha(buf, 41, 3),
    mic: readAlpha(buf, 44, 4),
    tickSizeTableId: buf.readInt32BE(48),
    note: readAlpha(buf, 52, 108)
  };
}

function buildGenericParser(typeCode) {
  return function(buf) {
    return {
      msgType: typeCode,
      nanos: buf.length > 4 ? buf.readInt32BE(1) : 0,
      __rawLength: buf.length
    };
  }
}

function parseAddAnonymousOrder(buf) {
  return {
    msgType: 'A',
    nanos:             buf.readInt32BE(1),
    orderId:           buf.readBigInt64BE(5).toString(),
    orderBookId:       buf.readInt32BE(13),
    side:              String.fromCharCode(buf[17]),       // 'B' or 'A'
    orderBookPosition: buf.readInt32BE(18),
    quantity:          buf.readBigInt64BE(22).toString(),
    price:             buf.readBigInt64BE(30).toString(),  // raw — divide later
    exchangeOrderType: buf.readInt16BE(38),
    quantityCondition: buf.readInt8(40),
  };
}

// Parsers mapping
const PARSERS = {
  'T': parseSecondsMessage,
  'R': parseOrderBookDirectory,
  'X': buildGenericParser('X'),
  'M': buildGenericParser('M'),
  'L': buildGenericParser('L'),
  'S': buildGenericParser('S'),
  'O': buildGenericParser('O'),
  'A': parseAddAnonymousOrder,
  'F': buildGenericParser('F'),
  'E': buildGenericParser('E'),
  'C': buildGenericParser('C'),
  'D': buildGenericParser('D'),
  'P': buildGenericParser('P'),
  'Z': buildGenericParser('Z'),
  'G': buildGenericParser('G')
};

// Lengths
const LENGTHS = {
  'T': 5,
  'R': 160,
  'X': 32,
  'M': 18,
  'L': 33,
  'S': 6,
  'O': 29,
  'A': 41,
  'F': 48,
  'E': 52,
  'C': 62,
  'D': 18,
  'P': 54,
  'Z': 65,
  'G': 21
};


function parseItchMessage(buffer) {
  if (buffer.length === 0) return null;
  const msgType = String.fromCharCode(buffer[0]);
  const parser = PARSERS[msgType];

  if (!parser) {
    logger.warn(`Unknown ITCH msgType: ${msgType}`);
    return { msgType, rawBuffer: buffer.toString('base64') };
  }

  try {
    return parser(buffer);
  } catch (err) {
    logger.error(`Error parsing ITCH message ${msgType}: ${err.message}`);
    return null;
  }
}

function parseSequencedPayload(payload, startingSeq) {
  const messages = [];
  let currentSeq = startingSeq;
  let offset = 0;

  while (offset < payload.length) {
    const msgTypeByte = payload[offset];
    const msgType = String.fromCharCode(msgTypeByte);
    const length = LENGTHS[msgType];

    if (!length) {
      logger.error(`Unknown ITCH message type ${msgType} at offset ${offset}. Bailing out of payload.`);
      break;
    }

    if (offset + length > payload.length) {
      logger.warn(`Partial message remains for type ${msgType}. Expected length ${length}, got ${payload.length - offset}.`);
      break;
    }

    // Subarray is zero-copy slice
    const msgBuf = payload.subarray(offset, offset + length);
    const parsedMsg = parseItchMessage(msgBuf);

    if (parsedMsg) {
      parsedMsg.sequenceNo = currentSeq;
      // We also return the raw buffer slice for Redis storage
      messages.push({
        parsed: parsedMsg,
        raw: msgBuf
      });
    }

    currentSeq++;
    offset += length;
  }

  return {
    messages,
    nextSeq: currentSeq
  };
}

module.exports = {
  parseItchMessage,
  parseSequencedPayload,
  LENGTHS
};

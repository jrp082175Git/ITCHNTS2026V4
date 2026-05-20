function validateConfig(config) {
  const errors = [];

  const requiredTopLevel = ['receiver', 'redis', 'logging', 'state', 'queue', 'reconnect'];
  for (const key of requiredTopLevel) {
    if (!config[key] || typeof config[key] !== 'object') {
      errors.push(`Missing or invalid top-level key: ${key}`);
    }
  }

  if (config.receiver) {
    if (!config.receiver.tcpRelay || typeof config.receiver.tcpRelay.port !== 'number') {
      errors.push('Missing or invalid receiver.tcpRelay.port');
    }
    if (!config.receiver.retransmission || typeof config.receiver.retransmission.port !== 'number') {
      errors.push('Missing or invalid receiver.retransmission.port');
    }
  }

  if (config.redis) {
    if (typeof config.redis.host !== 'string' || typeof config.redis.port !== 'number') {
      errors.push('Missing or invalid redis connection properties');
    }
  }

  if (config.queue) {
    if (!Number.isInteger(config.queue.maxOnQueue1) || config.queue.maxOnQueue1 <= 0) {
      errors.push('Invalid queue.maxOnQueue1');
    }
    if (!Number.isInteger(config.queue.maxOnQueue2) || config.queue.maxOnQueue2 <= 0) {
      errors.push('Invalid queue.maxOnQueue2');
    }
    if (!Number.isInteger(config.queue.retransmissionMaxRange) || config.queue.retransmissionMaxRange <= 0) {
      errors.push('Invalid queue.retransmissionMaxRange');
    }
  }

  return errors;
}

module.exports = { validateConfig };

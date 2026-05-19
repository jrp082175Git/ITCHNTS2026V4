const fs = require('fs');
const path = require('path');

function validateConfig(config) {
  const errors = [];

  // General checks
  if (!config.itch || !config.redis || !config.servers || !config.logging || !config.session || !config.heartbeat) {
    errors.push('Missing top-level keys in config.');
  }

  // Ports
  if (config.servers) {
    for (const [key, srv] of Object.entries(config.servers)) {
      if (typeof srv.port !== 'number' || srv.port <= 0 || srv.port > 65535) {
        errors.push(`Invalid port for server ${key}: ${srv.port}`);
      }
    }
  }

  // ITCH Environments
  if (config.itch) {
    for (const env of ['prod', 'dr']) {
      const conf = config.itch[env];
      if (!conf) {
        errors.push(`Missing ITCH environment: ${env}`);
        continue;
      }
      if (typeof conf.host !== 'string' || !conf.host) errors.push(`ITCH ${env} missing host`);
      if (typeof conf.port !== 'number' || conf.port <= 0) errors.push(`ITCH ${env} missing or invalid port`);
      if (typeof conf.username !== 'string' || !conf.username) errors.push(`ITCH ${env} missing username`);
      if (typeof conf.password !== 'string' || !conf.password) errors.push(`ITCH ${env} missing password`);

      // Basic safeguard
      if (env === 'prod' && conf.password === 'PWDPRD') {
        console.warn('WARNING: Using default placeholder password for PROD. This is unsafe for production environments.');
      }
    }
  }

  return errors;
}

module.exports = { validateConfig };

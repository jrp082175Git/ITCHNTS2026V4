const fs = require('fs');
const path = require('path');
const { validateConfig } = require('./validator');

function loadConfig() {
  const configPath = path.resolve(__dirname, '../../config/config.json');
  let config;

  try {
    const rawData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(rawData);
  } catch (error) {
    console.error(`Failed to load config file at ${configPath}: ${error.message}`);
    process.exit(1);
  }

  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error('- ' + e));
    process.exit(1);
  }

  function deepFreeze(object) {
    const propNames = Object.getOwnPropertyNames(object);
    for (const name of propNames) {
      const value = object[name];
      if (value && typeof value === 'object') {
        deepFreeze(value);
      }
    }
    return Object.freeze(object);
  }

  return deepFreeze(config);
}

module.exports = loadConfig();

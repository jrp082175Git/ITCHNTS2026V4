const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('../config/loader');

let users = 'SYSTEM';

function initLogger(cliUsers) {
  if (cliUsers) {
    users = cliUsers;
  }
}

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}] [${users}] ${message}`;
});

const transport = new DailyRotateFile({
  filename: 'processor-%DATE%.log',
  dirname: config.logging.directory || './logs',
  datePattern: 'YYYYMMDD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

const logger = winston.createLogger({
  level: config.logging.level || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    customFormat
  ),
  transports: [
    transport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        customFormat
      )
    })
  ]
});

logger.json = function(label, jsonString) {
  this.info(`[${label}] ${jsonString}`);
};

module.exports = {
  initLogger,
  logger
};

const winston = require('winston');
const config = require('./config');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }
  return info;
});

const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    enumerateErrorFormat(),
    winston.format.timestamp(),
    winston.format.splat(),
    winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
    // Add file transports
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
    }),
  ],
});

module.exports = logger;

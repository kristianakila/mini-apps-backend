const winston = require('winston');
const config = require('../config');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaString = '';
    if (Object.keys(meta).length > 0) {
      metaString = ` ${JSON.stringify(meta)}`;
    }
    return `[${timestamp}] ${level}: ${message}${metaString}`;
  })
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'mini-apps-backend' },
  transports: [
    new winston.transports.File({
      filename: config.logging.file,
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: config.logging.file.replace('.log', '-combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

if (config.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// HTTP запросы логгер
const httpLogger = winston.createLogger({
  level: 'http',
  format: logFormat,
  defaultMeta: { service: 'mini-apps-backend' },
  transports: [
    new winston.transports.File({
      filename: config.logging.file.replace('.log', '-http.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Создаем метод для HTTP логов
logger.http = (message) => {
  httpLogger.info(message);
};

// Обработка неперехваченных ошибок
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = logger;

// utils/logger.js
require('dotenv').config();

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, printf, colorize, splat } = format;

const logFormat = printf(({ timestamp, level, message, stack, ...meta }) => {
  let log = `${timestamp} [${level.toUpperCase()}] ${message}`;

  if (stack) {
    log += `\n${stack}`;
  }

  const metaKeys = Object.keys(meta);
  if (metaKeys.length > 0) {
    // Filter out Winston internals (Symbol keys, splat artifacts)
    const cleaned = Object.fromEntries(
      metaKeys
        .filter((k) => k !== 'Symbol(level)' && k !== 'Symbol(splat)')
        .map((k) => [k, meta[k]])
    );
    if (Object.keys(cleaned).length > 0) {
      log += `\n${JSON.stringify(cleaned, null, 2)}`;
    }
  }

  return log;
});

// Shared base formats (no colorize — added per-transport)
const baseFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
  logFormat
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',

  format: baseFormat,

  transports: [
    new transports.Console({
      // colorize must come BEFORE timestamp+logFormat so level coloring works
      // but timestamp must still be applied — achieved by a fresh combine here
      format: combine(
        colorize({ all: false, level: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        splat(),
        logFormat
      ),
    }),

    new transports.File({
      filename: 'error.log',
      level: 'error',
      format: baseFormat,
    }),

    new transports.File({
      filename: 'combined.log',
      format: baseFormat,
    }),
  ],
});

// Helpful methods
logger.success = (msg) => logger.info(`✅ ${msg}`);
logger.errorMsg = (msg) => logger.error(`❌ ${msg}`);

module.exports = logger;
// utils/logger.js
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, printf, colorize, splat, json } = format;

// ─── Environment ──────────────────────────────────────────────────────────────

const ENV = process.env.NODE_ENV || 'development';
const IS_PROD = ENV === 'production';
const IS_TEST = ENV === 'test';

// ─── Log directory ────────────────────────────────────────────────────────────

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true }); // no-op if it already exists

// ─── Custom pretty formatter ──────────────────────────────────────────────────
//
// Object.keys() never surfaces Symbol-keyed properties, so no Symbol filtering
// is needed. The only Winston artifact that can leak as a string key is
// `_splat` (left by the splat() format); we strip it explicitly.

const prettyFormat = printf(({ timestamp, level, message, stack, _splat, ...meta }) => {
  let log = `${timestamp} [${level.toUpperCase()}] ${message}`;

  if (stack) {
    log += `\n${stack}`;
  }

  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }

  return log;
});

// ─── Shared format pipeline pieces ────────────────────────────────────────────

const BASE_PIPES = [
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
];

// ─── Per-transport formats ────────────────────────────────────────────────────
//
// Console: colorize() must run first so `info.level` carries ANSI codes before
// prettyFormat reads it. We cannot share this pipeline with file transports
// because ANSI codes corrupt plain-text log files.
//
// File: use JSON in production (friendly to log aggregators like Datadog /
// CloudWatch) and pretty-print in development for readable tailing.

const consoleFormat = combine(
  colorize({ level: true }),
  ...BASE_PIPES,
  prettyFormat
);

const fileFormat = combine(
  ...BASE_PIPES,
  IS_PROD ? json() : prettyFormat
);

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = createLogger({
  // 'warn' in production cuts noise; 'debug' in development/test gives full
  // visibility. Override any time via the LOG_LEVEL env var.
  level: process.env.LOG_LEVEL || (IS_PROD ? 'warn' : 'debug'),

  // Keep Winston alive even if a transport throws — a logging failure should
  // never crash the application.
  exitOnError: false,

  // Suppress all output during automated tests unless explicitly re-enabled.
  silent: IS_TEST && !process.env.LOG_IN_TESTS,

  transports: [
    new transports.Console({ format: consoleFormat }),

    new transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
    }),

    new transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: fileFormat,
    }),
  ],
});

// ─── Semantic convenience methods ─────────────────────────────────────────────
//
// Mirror the core logger signature: (message, meta?) so callers can still pass
// structured metadata through these helpers.

logger.success = (msg, meta) => logger.info(`✅ ${msg}`, meta);
logger.fail    = (msg, meta) => logger.error(`❌ ${msg}`, meta);

module.exports = logger;
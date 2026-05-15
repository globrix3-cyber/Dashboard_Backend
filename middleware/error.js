// middleware/error.js
const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  logger.error(err.message, { stack: err.stack, status: err.status });
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    code:  err.code   || 'SERVER_ERROR',
  });
};

module.exports = errorHandler;

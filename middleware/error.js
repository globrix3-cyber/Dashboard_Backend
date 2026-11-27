// middleware/error.js
const logger = require('../utils/logger');

// Friendly messages for the unique rules people can actually hit from a form.
const DUPLICATE_MESSAGES = {
  users_phone_number_key: 'This phone number is already used by another account',
  users_email_key: 'An account with this email already exists',
  categories_slug_key: 'A category with this name already exists',
  categories_parent_id_name_key: 'A category with this name already exists',
  tags_name_key: 'This tag already exists',
  tags_slug_key: 'This tag already exists',
  rfq_responses_rfq_id_supplier_company_id_key: 'You have already sent a quote for this request',
  saved_suppliers_buyer_company_id_supplier_company_id_key: 'This supplier is already saved',
  reviews_order_id_reviewer_company_id_key: 'You have already reviewed this order',
  review_responses_review_id_key: 'This review already has a response',
};

// Turn Postgres errors into clear 4xx answers instead of a raw 500.
function fromPostgres(err) {
  switch (err.code) {
    case '23505':
      return { status: 409, code: 'ALREADY_EXISTS', error: DUPLICATE_MESSAGES[err.constraint] || 'This record already exists' };
    case '23503':
      return { status: 400, code: 'INVALID_REFERENCE', error: 'A linked record does not exist' };
    case '23502':
      return { status: 400, code: 'VALIDATION_ERROR', error: `Missing required field${err.column ? `: ${err.column}` : ''}` };
    case '22P02':
    case '22007':
    case '22008':
      return { status: 400, code: 'VALIDATION_ERROR', error: 'One of the values has an invalid format' };
    case '22001':
      return { status: 400, code: 'VALIDATION_ERROR', error: 'One of the values is too long' };
    case '23514':
      return { status: 400, code: 'VALIDATION_ERROR', error: 'One of the values is not allowed' };
    default:
      return null;
  }
}

const errorHandler = (err, req, res, _next) => {
  const pg = !err.status && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? fromPostgres(err) : null;
  if (pg) {
    logger.warn(err.message, { pgCode: err.code, constraint: err.constraint, path: req.originalUrl });
    return res.status(pg.status).json({ error: pg.error, code: pg.code });
  }
  logger.error(err.message, { stack: err.stack, status: err.status });
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    code:  err.code   || 'SERVER_ERROR',
  });
};

module.exports = errorHandler;

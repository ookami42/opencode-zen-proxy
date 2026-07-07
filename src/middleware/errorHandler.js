'use strict';

const { logger } = require('../logger');

/**
 * Global error handler middleware.
 * Catches errors and returns them in OpenAI-compatible format.
 */
function errorHandler(err, req, res, _next) {
  logger.error(`${err.message}`, err.stack || '');

  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;

  res.status(statusCode).json({
    error: {
      message: isServerError ? 'Internal server error.' : (err.message || 'Invalid request.'),
      type: isServerError ? 'server_error' : (err.type || 'invalid_request_error'),
      param: err.param || null,
      code: err.code || (isServerError ? 'internal_error' : 'invalid_request'),
    },
  });
}

/**
 * 404 handler for unknown routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      type: 'not_found_error',
      param: null,
      code: 'route_not_found',
    },
  });
}

module.exports = { errorHandler, notFoundHandler };

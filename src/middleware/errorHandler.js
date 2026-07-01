'use strict';

/**
 * Global error handler middleware.
 * Catches errors and returns them in OpenAI-compatible format.
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${err.message}`, err.stack || '');

  const statusCode = err.statusCode || 500;
  const type = statusCode >= 500 ? 'server_error' : 'invalid_request_error';

  res.status(statusCode).json({
    error: {
      message: err.message || 'An unexpected error occurred.',
      type,
      param: err.param || null,
      code: err.code || 'internal_error',
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

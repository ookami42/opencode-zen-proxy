'use strict';

const { config } = require('../config/constants');

/**
 * Authentication middleware.
 *
 * Two keys are kept separate:
 *   - config.zenApiKey   : the upstream key sent TO Zen ("public" by default,
 *                          which unlocks free-tier models).
 *   - config.clientApiKey: an optional key enforced ON clients. When empty,
 *                          the proxy is open (no client auth required).
 *
 * This lets the proxy stay keyless for local use while still allowing an
 * operator to gate client access with CLIENT_API_KEY if they expose it.
 */
function authMiddleware(req, res, next) {
  if (config.clientApiKey) {
    const authHeader = req.headers.authorization || '';
    const provided = authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '').trim()
      : '';

    if (provided !== config.clientApiKey) {
      return res.status(401).json({
        error: {
          message: 'Invalid or missing API key.',
          type: 'auth_error',
          param: null,
          code: 'invalid_api_key',
        },
      });
    }
  }

  next();
}

module.exports = { authMiddleware };

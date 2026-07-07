'use strict';

const crypto = require('crypto');
const { config } = require('../config/constants');
const { logger } = require('../logger');

if (process.env.NODE_ENV === 'production' && !config.clientApiKey) {
  throw new Error(
    'FATAL: CLIENT_API_KEY must be set when NODE_ENV=production. ' +
    'Add it as a secret in the Render dashboard.'
  );
}

function safeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

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

    if (!safeStringEqual(provided, config.clientApiKey)) {
      const prefix = provided ? `${provided.slice(0, 4)}…` : 'missing';
      logger.warn(`auth rejected from ${req.ip} (key=${prefix})`);
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

'use strict';

const { logger } = require('../logger');
const { config } = require('../config/constants');

const isHealthPath = (url) => url === '/health' || url === '/';

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const health = isHealthPath(req.originalUrl);

  res.on('finish', () => {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    const ms = elapsed.toFixed(1);
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    if (health && !config.logHealthChecks) return;

    const parts = [
      req.method,
      req.originalUrl,
      status,
      `${ms}ms`,
      `ip=${req.ip || req.socket.remoteAddress}`,
    ];

    const authHeader = req.headers.authorization || '';
    if (authHeader) {
      const provided = authHeader.startsWith('Bearer ')
        ? authHeader.replace('Bearer ', '').trim()
        : '';
      parts.push(`auth=${provided ? '✓' : '✗'}`);
    } else {
      parts.push('auth=–');
    }

    if (config.logRequestMeta && req.body && typeof req.body === 'object' && req.body.model) {
      parts.push(`model=${req.body.model}`);
      if (req.body.stream) parts.push('stream');
    }

    const ua = req.headers['user-agent'];
    if (ua) parts.push(`ua=${ua.slice(0, 60)}`);

    logger[level](' ', parts.join('  '));
  });

  next();
}

module.exports = { requestLogger };

#!/usr/bin/env node

'use strict';

const { createApp } = require('./server');
const { config } = require('./config/constants');
const { logger } = require('./logger');

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  const authMode = config.clientApiKey
    ? 'client auth (CLIENT_API_KEY)'
    : 'keyless (open to local clients)';
  logger.info(`
╔══════════════════════════════════════════════════════════════╗
║              OpenCode Zen Proxy v1.0.0                       ║
║        OpenAI-compatible proxy for OpenCode Zen API          ║
╚══════════════════════════════════════════════════════════════╝

  Server running at: http://${config.host}:${config.port}
  Health check:      http://${config.host}:${config.port}/health
  Models list:       http://${config.host}:${config.port}/v1/models
  Chat completions:  POST http://${config.host}:${config.port}/v1/chat/completions

  Backend:           ${config.zenApiBaseUrl} (direct, no local binary)
  Auth mode:         ${authMode}
  Upstream key:      ${config.zenApiKey === 'public' ? '"public" (free-tier models)' : '(configured)'}
  Free models:       5 models (use with or without "opencode/" prefix)
  Rate limit:        ${config.rateLimitMax} req / ${config.rateLimitWindowMs / 1000}s
  Log level:         ${config.logLevel}

  Examples:
    curl http://${config.host}:${config.port}/v1/chat/completions \\
      -H "Content-Type: application/json" \\
      ${config.clientApiKey ? '-H "Authorization: Bearer $CLIENT_API_KEY" \\' : ''}
      -d '{
        "model": "opencode/deepseek-v4-flash-free",
        "messages": [{"role": "user", "content": "Say hello!"}]
      }'
`);
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  shutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  shutdown('UNHANDLED_REJECTION');
});

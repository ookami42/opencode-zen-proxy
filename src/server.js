'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { config } = require('./config/constants');
const { authMiddleware } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const healthRoutes = require('./routes/health');
const modelsRoutes = require('./routes/models');
const chatRoutes = require('./routes/chatCompletions');

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests. Please try again later.',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    },
  },
});

/**
 * Create and configure the Express application.
 */
function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy || '1');

  // ----- Global Middleware -----
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));
  app.use(cors({
    origin: config.corsOrigin || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // ----- Open Routes (no auth required) -----
  app.use('/', healthRoutes);

  // ----- Authenticated Routes -----
  app.use('/v1', limiter);
  app.use('/v1', authMiddleware);

  // Model listing endpoints (require auth per Zen API convention)
  app.use('/v1', modelsRoutes);

  // Chat completions endpoint
  app.use('/v1', chatRoutes);

  // ----- Error Handling -----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

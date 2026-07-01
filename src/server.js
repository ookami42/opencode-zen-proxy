'use strict';

const express = require('express');
const cors = require('cors');

const { authMiddleware } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const modelsRoutes = require('./routes/models');
const chatRoutes = require('./routes/chatCompletions');

/**
 * Create and configure the Express application.
 */
function createApp() {
  const app = express();

  // ----- Global Middleware -----
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ----- Open Routes (no auth required) -----
  app.use('/', healthRoutes);

  // ----- Authenticated Routes -----
  // Apply auth middleware to all /v1/* routes
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

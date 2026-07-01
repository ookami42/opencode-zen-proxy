'use strict';

const express = require('express');
const zen = require('../services/zenClient');

const router = express.Router();

/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible chat completions endpoint, backed directly by the
 * OpenCode Zen gateway. The request body is forwarded verbatim (minus the
 * "opencode/" model prefix), so native OpenAI features all work:
 *
 *   - streaming (SSE)
 *   - tool / function calling
 *   - tool_choice
 *   - response_format (JSON mode)
 *   - temperature, top_p, seed, max_tokens, ...
 *
 * No local `opencode serve` instance is required.
 */
router.post('/chat/completions', async (req, res, next) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({
        error: { message: 'Request body must be a JSON object.', type: 'invalid_request_error' },
      });
    }
    if (!payload.model) {
      return res.status(400).json({
        error: {
          message: 'The model field is required.',
          type: 'invalid_request_error',
          param: 'model',
          code: 'missing_required_parameter',
        },
      });
    }
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'The messages field is required and must be a non-empty array.',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'missing_required_parameter',
        },
      });
    }

    const result = await zen.forwardChatCompletion(payload);

    if (result.stream) {
      // Pipe the upstream SSE stream straight through to the client. The Zen
      // gateway already emits OpenAI-format chunks, so no transformation is
      // needed. Setting these headers and aborting the upstream on client
      // disconnect keeps things clean for streaming clients.
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const upstream = result.response;
      upstream.pipe(res);

      upstream.on('error', (err) => {
        if (!res.headersSent) {
          next(err);
        } else {
          res.end();
        }
      });

      req.on('close', () => {
        upstream.destroy();
      });
      return;
    }

    // Non-streaming: return the parsed JSON body unchanged.
    res.status(result.statusCode).json(result.data);
  } catch (err) {
    // Translate Zen error envelopes into OpenAI format and keep the status.
    const status = err.statusCode || 500;
    res.status(status).json({
      error: {
        message: err.message,
        type: err.type || 'api_error',
        code: err.code || null,
      },
    });
  }
});

module.exports = router;

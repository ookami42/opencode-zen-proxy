'use strict';

const express = require('express');
const zen = require('../services/zenClient');
const { config } = require('../config/constants');

const router = express.Router();

const MAX_MESSAGES = 100;

function validatePayload(payload, errors) {
  if (Array.isArray(payload.messages) && payload.messages.length > MAX_MESSAGES) {
    errors.push(`messages exceeds ${MAX_MESSAGES}`);
  }
  if (Array.isArray(payload.messages)) {
    for (const m of payload.messages) {
      const c = m && m.content;
      if (typeof c === 'string') {
        if (c.length > config.maxContentChars) { errors.push('message content too long'); break; }
      } else if (Array.isArray(c)) {
        let total = 0;
        for (const part of c) {
          if (part && typeof part.text === 'string') total += part.text.length;
        }
        if (total > config.maxContentChars) { errors.push('message content too long'); break; }
      }
    }
  }
  if (payload.temperature !== undefined && (typeof payload.temperature !== 'number' || payload.temperature < 0 || payload.temperature > 2)) {
    errors.push('temperature must be in [0,2]');
  }
  if (payload.max_tokens !== undefined && (typeof payload.max_tokens !== 'number' || payload.max_tokens < 1 || payload.max_tokens > config.maxOutputTokens)) {
    errors.push(`max_tokens must be in [1,${config.maxOutputTokens}]`);
  }
  if (payload.n !== undefined && payload.n !== 1) {
    errors.push('only n=1 is supported');
  }
}

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

    const valErrors = [];
    validatePayload(payload, valErrors);
    if (valErrors.length > 0) {
      return res.status(400).json({
        error: { message: valErrors.join('; '), type: 'invalid_request_error', code: 'invalid_payload' },
      });
    }

    res.setTimeout(120000);
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

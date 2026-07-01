'use strict';

const express = require('express');
const zen = require('../services/zenClient');
const { FREE_MODELS, getModelInfo, resolveModelId } = require('../config/models');

const router = express.Router();

/**
 * GET /v1/models
 *
 * Lists models in OpenAI-compatible format. Tries to proxy the live Zen
 * catalog first; on any upstream failure it falls back to the built-in
 * free model list so the endpoint always responds.
 */
router.get('/models', async (_req, res) => {
  try {
    const result = await zen.fetchModels();
    res.json(result.data || { object: 'list', data: [] });
  } catch {
    // Fallback to the curated free list.
    const data = FREE_MODELS.map((model) => ({
      id: model.id,
      object: 'model',
      created: 1719792000,
      owned_by: model.provider || 'opencode',
      free: true,
    }));
    res.json({ object: 'list', data });
  }
});

/**
 * GET /v1/models/free
 *
 * Custom endpoint listing only the free models. Defined before the
 * wildcard route below so "free" is not captured as a modelId.
 */
router.get('/models/free', (_req, res) => {
  const data = FREE_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    object: 'model',
    created: 1719792000,
    owned_by: model.provider || 'opencode',
    free: true,
    description: model.description || '',
    supportsStreaming: model.supportsStreaming,
    supportsTools: model.supportsTools,
  }));

  res.json({ object: 'list', data });
});

/**
 * GET /v1/models/:modelId
 *
 * Returns details for a specific model. Wildcard (*) captures ids that
 * contain slashes, e.g. "opencode/deepseek-v4-flash-free".
 */
router.get('/models/:modelId(*)', (req, res) => {
  const modelId = req.params.modelId;
  const canonicalId = resolveModelId(modelId);
  const model = getModelInfo(canonicalId);

  if (!model) {
    return res.status(404).json({
      error: {
        message: `Model '${modelId}' not found.`,
        type: 'invalid_request_error',
        param: null,
        code: 'model_not_found',
      },
    });
  }

  res.json({
    id: model.id,
    object: 'model',
    created: 1719792000,
    owned_by: model.provider || 'opencode',
    free: !!model.free,
    description: model.description || '',
  });
});

module.exports = router;

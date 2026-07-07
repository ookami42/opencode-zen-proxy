'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',

  // OpenCode Zen API (direct, keyless for free models).
  // The Zen gateway accepts "public" as a bearer token that unlocks the
  // free-tier models (deepseek-v4-flash-free, mimo-v2.5-free, ...). This is
  // exactly what the opencode CLI does internally when no API key is set:
  //   options: hasKey ? {} : { apiKey: "public" }
  // No local `opencode serve` binary is required.
  zenApiBaseUrl: process.env.ZEN_API_BASE_URL || 'https://opencode.ai/zen/v1',
  zenApiKey: process.env.ZEN_API_KEY || process.env.OPENCODE_API_KEY || 'public',

  // Optional: when set, the proxy enforces this key on incoming clients
  // (otherwise any client key is accepted, for local use).
  clientApiKey: process.env.CLIENT_API_KEY || '',

  // Reasoning effort applied to reasoning-capable models when the client does
  // not specify one. Valid values (confirmed against the Zen/DeepSeek gateway):
  //   "low" | "medium" | "high" | "max" | "xhigh"
  // "xhigh" maximizes chain-of-thought length. Set via env to override.
  defaultReasoningEffort: process.env.DEFAULT_REASONING_EFFORT || 'xhigh',

  // CORS origin allowlist (defaults to '*' — safe when gated by CLIENT_API_KEY).
  // Set to a comma-separated list like "https://app.example.com,https://api.example.com".
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Trust proxy hop (Render: 1, nginx + Render: 2). Needed for rate-limit per real-IP.
  trustProxy: process.env.TRUST_PROXY || '1',

  // Rate limiting (applied to /v1 routes)
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 60,

  // Logging (debug | info | warn | error)
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = { config };

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { config } = require('../config/constants');

/**
 * OpenCode Zen API client (direct mode).
 *
 * The Zen gateway at https://opencode.ai/zen/v1 is itself fully
 * OpenAI-compatible: chat completions, tool/function calling and SSE
 * streaming all pass through untouched. The only adjustments the proxy
 * makes are:
 *
 *   1. Inject the bearer token ("public" unlocks free-tier models, or a
 *      real ZEN_API_KEY when configured).
 *   2. Strip the "opencode/" prefix from the requested model id, since Zen
 *      expects the bare id (e.g. "deepseek-v4-flash-free").
 *
 * Everything else — messages, tools, tool_choice, response_format, stream —
 * is forwarded verbatim so native tool calling works end-to-end.
 */

/**
 * Normalize a Zen error body into the OpenAI error envelope.
 *
 * Zen uses:   { "type": "error", "error": { "type": "AuthError", "message": "..." } }
 * OpenAI:     { "error": { "message": "...", "type": "...", "code": "..." } }
 */
function normalizeZenError(httpStatus, body) {
  if (body && body.type === 'error' && body.error) {
    return {
      message: body.error.message || 'Unknown error',
      type: body.error.type || 'api_error',
      code: body.error.type || `http_${httpStatus}`,
    };
  }
  if (body && body.error) {
    return {
      message: body.error.message || 'Unknown error',
      type: body.error.type || 'api_error',
      code: body.error.code || `http_${httpStatus}`,
    };
  }
  return {
    message: typeof body === 'string' ? body : `HTTP ${httpStatus} from upstream`,
    type: 'api_error',
    code: `http_${httpStatus}`,
  };
}

/**
 * Core HTTP(S) request helper. For streaming requests it resolves with the
 * raw response stream so the caller can pipe it straight to the client.
 *
 * @param {string} method
 * @param {string} path            - path under the Zen base URL (e.g. /chat/completions)
 * @param {object} headers         - pre-built headers (auth injected here)
 * @param {string|null} body       - stringified JSON body, if any
 * @param {boolean} stream         - whether to stream the response
 * @returns {Promise<{stream:boolean, response?:object, data?:object, statusCode:number}>}
 */
function requestZenApi(method, path, headers, body, stream = false) {
  return new Promise((resolve, reject) => {
    const baseUrl = new URL(config.zenApiBaseUrl);
    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (baseUrl.protocol === 'https:' ? 443 : 80),
      path: `${baseUrl.pathname.replace(/\/+$/, '')}${path}`,
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      timeout: 600000, // 10 minutes for long-running generations
    };

    const requester = baseUrl.protocol === 'http:' ? http : https;

    const req = requester.request(options, (res) => {
      const statusCode = res.statusCode;

      // Stream the body straight through on success.
      if (stream && statusCode === 200) {
        return resolve({ stream: true, response: res, statusCode });
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        if (statusCode >= 200 && statusCode < 300) {
          return resolve({ stream: false, data: parsed, statusCode });
        }

        const err = normalizeZenError(statusCode, parsed);
        const error = new Error(err.message);
        error.statusCode = statusCode;
        error.code = err.code;
        error.type = err.type;
        reject(error);
      });
    });

    req.on('error', (err) => {
      const error = new Error(`Failed to connect to Zen API: ${err.message}`);
      error.statusCode = 502;
      error.code = 'upstream_connection_error';
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      const error = new Error('Zen API request timed out after 10 minutes');
      error.statusCode = 504;
      error.code = 'upstream_timeout';
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Build the bearer auth header value.
 */
function getAuthHeader() {
  return `Bearer ${config.zenApiKey}`;
}

/**
 * Strip the "opencode/" provider prefix from a model id, if present.
 * Zen expects bare ids like "deepseek-v4-flash-free".
 */
function stripProviderPrefix(model) {
  if (typeof model !== 'string') return model;
  return model.startsWith('opencode/') ? model.slice('opencode/'.length) : model;
}

/**
 * Reasoning effort values accepted by the Zen/DeepSeek gateway for reasoning
 * models. Confirmed empirically: the provider rejects "none"/"minimal" with
 *   "unknown variant, expected one of `high`, `low`, `medium`, `max`, `xhigh`".
 */
const VALID_REASONING_EFFORTS = ['low', 'medium', 'high', 'max', 'xhigh'];

/**
 * Normalize a client-supplied reasoning_effort value into one the gateway
 * accepts, falling back to the configured default. Non-reasoning requests
 * (or invalid values that don't match a known effort) are left untouched so
 * the upstream can apply its own behavior.
 */
function resolveReasoningEffort(clientValue) {
  if (typeof clientValue === 'string' && VALID_REASONING_EFFORTS.includes(clientValue.toLowerCase())) {
    return clientValue.toLowerCase();
  }
  return config.defaultReasoningEffort;
}

/**
 * Forward a chat completion request to the Zen API.
 *
 * The payload is passed through unchanged except for:
 *   - the model id (strips the "opencode/" prefix)
 *   - reasoning_effort, which defaults to the configured maximum ("xhigh")
 *     when the client does not specify a valid value, so reasoning models
 *     always think at full depth. Clients can override per-request with any
 *     of: low | medium | high | max | xhigh.
 *
 * tools, tool_choice, response_format, temperature, top_p, seed, stream,
 * max_tokens, etc. all reach the upstream model intact, preserving native
 * OpenAI function calling.
 *
 * @param {object} payload - the raw OpenAI chat completion request body
 * @returns {Promise<object>} Zen response ({stream, response|data, statusCode})
 */
async function forwardChatCompletion(payload) {
  const normalized = { ...payload };
  if (normalized.model) {
    normalized.model = stripProviderPrefix(normalized.model);
  }

  // Inject default reasoning effort when the client did not request a valid
  // one. The field is forwarded as-is; Zen/DeepSeek only honors it on
  // reasoning-capable models and ignores it elsewhere.
  normalized.reasoning_effort = resolveReasoningEffort(normalized.reasoning_effort);

  const headers = { Authorization: getAuthHeader() };
  const isStream = normalized.stream === true;
  const body = JSON.stringify(normalized);

  return requestZenApi('POST', '/chat/completions', headers, body, isStream);
}

/**
 * Fetch the list of models from the Zen API.
 */
async function fetchModels() {
  const headers = { Authorization: getAuthHeader() };
  return requestZenApi('GET', '/models', headers, null, false);
}

module.exports = {
  forwardChatCompletion,
  fetchModels,
  normalizeZenError,
  stripProviderPrefix,
  resolveReasoningEffort,
  VALID_REASONING_EFFORTS,
};

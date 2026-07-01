# OpenCode Zen Reverse Engineering Analysis

> **Date:** June 27, 2026
> **Target:** OpenCode Zen API (`https://opencode.ai/zen/v1`)
> **Purpose:** Create an OpenAI-compatible proxy for OpenCode Zen free models

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Endpoints](#3-api-endpoints)
4. [Authentication Flow](#4-authentication-flow)
5. [Request/Response Formats](#5-requestresponse-formats)
6. [Streaming (SSE)](#6-streaming-sse)
7. [Model Catalog](#7-model-catalog)
8. [Error Handling](#8-error-handling)
9. [Provider Routing](#9-provider-routing)
10. [Pricing & Free Tiers](#10-pricing--free-tiers)

---

## 1. Overview

OpenCode Zen is an **AI gateway** service, not a model provider itself. It sits between the client (OpenCode CLI or any OpenAI-compatible client) and multiple downstream model providers. Its primary functions are:

- **Routing:** Determine which downstream provider to use based on the requested model
- **Transformation:** Normalize requests/responses between OpenAI, Anthropic, and other provider formats
- **Billing:** Track token usage and charge users on a pay-as-you-go basis
- **Caching:** Provide smart caching for repeated prompts
- **Benchmarking:** Curate only high-performing model-provider combinations

The Zen API is fully **OpenAI-compatible**, meaning any tool that supports OpenAI's API format can use Zen by simply changing the `baseURL`.

### Key Insight

Zen is NOT a model - it's a **proxy/routing layer**. When a user requests `opencode/deepseek-v4-flash-free`, Zen:
1. Receives the request in OpenAI format
2. Maps it to the appropriate downstream provider (DeepSeek)
3. Transforms the request to the provider's native format if needed
4. Sends the request to the provider
5. Transforms the response back to OpenAI format
6. Returns it to the client, adding billing metadata

---

## 2. Architecture

The following is reconstructed from the OpenCode source code repository (`anomalyco/opencode`):

```
Client (OpenCode CLI / 3rd-party tool)
    │
    ▼
┌─────────────────────────────────────┐
│         OpenCode Zen API            │
│  https://opencode.ai/zen/v1         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   Route Handler             │   │
│  │   (Express Router)          │   │
│  └──────────┬──────────────────┘   │
│             │                       │
│  ┌──────────▼──────────────────┐   │
│  │   ProviderHelper Factory    │   │
│  │   (Mediator Pattern)        │   │
│  │                             │   │
│  │  ┌──────────┐ ┌──────────┐ │   │
│  │  │  OpenAI  │ │ Anthropic│ │   │
│  │  │  Helper  │ │  Helper   │ │   │
│  │  └──────────┘ └──────────┘ │   │
│  │  ┌──────────┐ ┌──────────┐ │   │
│  │  │OpenAI-   │ │  Other   │ │   │
│  │  │Compatible│ │ Helpers  │ │   │
│  │  └──────────┘ └──────────┘ │   │
│  └──────────┬──────────────────┘   │
│             │                       │
│  ┌──────────▼──────────────────┐   │
│  │   Downstream Provider       │   │
│  │   (DeepSeek, OpenAI,        │   │
│  │    Anthropic, Google, etc.) │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Internal Components (from source code analysis)

| Component | Source Path | Description |
|-----------|-------------|-------------|
| `ProviderHelper` | `.../provider/provider.ts` | Interface defining how to transform requests/responses |
| `OpenAIHelper` | `.../provider/openai.ts` | Handles OpenAI <-> CommonRequest mapping |
| `AnthropicHelper` | `.../provider/anthropic.ts` | Handles Anthropic <-> CommonRequest mapping |
| `OpenAICompatibleHelper` | `.../provider/openai-compatible.ts` | Handles generic OpenAI-compatible providers |
| `BodyConverter` | `.../provider/provider.ts` | Dynamic conversion pipeline between formats |
| `UsageParser` | `.../provider/provider.ts` | Normalizes token usage across providers |

### CommonRequest Interface

The Zen API normalizes all requests into a `CommonRequest` structure:

```typescript
interface CommonRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  stream?: boolean;
  response_format?: ResponseFormat;
}
```

---

## 3. API Endpoints

### Base URL: `https://opencode.ai/zen/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat/completions` | POST | Standard chat completions (OpenAI-compatible) |
| `/models` | GET | List all available models |
| `/models/:id` | GET | Get specific model details |
| `/responses` | POST | Newer OpenAI Responses API |
| `/messages` | POST | Anthropic-compatible messages endpoint |

### Path Mapping

Based on model type, Zen routes to different endpoints:

```
OpenAI models (GPT, etc.):    /v1/chat/completions  OR  /v1/responses
Anthropic models (Claude):    /v1/messages
Google models (Gemini):       /v1/models/gemini:...
Other providers:              /v1/chat/completions  (OpenAI-compatible)
```

---

## 4. Authentication Flow

### Client -> Zen API

```
Authorization: Bearer <ZEN_API_KEY>
```

The API key is obtained by:
1. Visiting https://opencode.ai/auth
2. Signing in (GitHub or Google OAuth)
3. Adding billing information
4. Generating an API key

### Zen -> Downstream Provider

When Zen forwards requests to downstream providers, it uses a combination of:

- **Zen-managed keys:** For most providers, Zen uses its own API keys (billed to the user by Zen)
- **BYOK (Bring Your Own Key):** Users can configure their own provider API keys within Zen
- **Header injection:** The `modifyHeaders` function in each `ProviderHelper` injects the appropriate auth header:
  ```typescript
  modifyHeaders: (headers, apiKey, stickyId) => {
    headers.set("authorization", `Bearer ${apiKey}`);
  }
  ```

### Key Storage (OpenCode CLI)

When using the OpenCode CLI, credentials are stored in:
- `~/.local/share/opencode/auth.json`
- `~/.config/opencode/opencode.json`

---

## 5. Request/Response Formats

### Standard OpenAI Chat Completions Request

**Request:**
```json
{
  "model": "opencode/deepseek-v4-flash-free",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Write a Python function."}
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

**Model ID Formats:**
- Canonical: `opencode/deepseek-v4-flash-free`
- Short alias: `deepseek-v4-flash-free` (Zen accepts this)
- The `opencode/` prefix is the provider identifier in the OpenCode ecosystem

**Response (OpenAI-compatible):**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1719792000,
  "model": "opencode/deepseek-v4-flash-free",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Here's a Python function..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 100,
    "total_tokens": 125,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

### Extended Usage Object

Zen extends the standard OpenAI usage object with additional fields for modern models:

```json
{
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 100,
    "total_tokens": 125,
    "prompt_tokens_details": {
      "cached_tokens": 10
    },
    "completion_tokens_details": {
      "reasoning_tokens": 50
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `cached_tokens` | Tokens served from cache (affects billing) |
| `reasoning_tokens` | Tokens used for chain-of-thought/reasoning |

---

## 6. Streaming (SSE)

The Zen API supports Server-Sent Events (SSE) streaming identical to OpenAI's format.

### Request
```json
{
  "model": "opencode/deepseek-v4-flash-free",
  "messages": [{"role": "user", "content": "Count to 5."}],
  "stream": true
}
```

### Response (SSE stream)
```
data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","choices":[{"delta":{"content":"1"},"index":0}]}

data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","choices":[{"delta":{"content":" 2"},"index":0}]}

data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","choices":[{"delta":{"content":" 3"},"index":0}]}

data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","choices":[{"delta":{"content":" 4"},"index":0}]}

data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","choices":[{"delta":{"content":" 5"},"index":0,"finish_reason":"stop"}]}

data: [DONE]
```

---

## 7. Model Catalog

### Free Models (OpenCode Zen Plan)

As of June 2026, the following models are available for free:

| Model ID | Provider | Family | Streaming | Tools |
|----------|----------|--------|-----------|-------|
| `opencode/deepseek-v4-flash-free` | DeepSeek | DeepSeek V4 | ✅ | ✅ |
| `opencode/big-pickle` | Big Pickle | Big Pickle | ✅ | ❌ |
| `opencode/nemotron-3-super-free` | NVIDIA | Nemotron 3 | ✅ | ✅ |
| `opencode/grok-code` | xAI | Grok | ✅ | ✅ |
| `opencode/hy3-preview-free` | Hy3 | Hy3 | ✅ | ❌ |
| `opencode/kimi-k2.5-free` | Kimi | Kimi K2.5 | ✅ | ✅ |
| `opencode/ling-2.6-flash-free` | Ling | Ling 2.6 | ✅ | ❌ |
| `opencode/mimo-v2-flash-free` | MiMo | MiMo V2 | ✅ | ✅ |
| `opencode/mimo-v2-omni-free` | MiMo | MiMo V2 | ✅ | ✅ |
| `opencode/mimo-v2-pro-free` | MiMo | MiMo V2 | ✅ | ✅ |
| `opencode/mimo-v2.5-free` | MiMo | MiMo V2.5 | ✅ | ✅ |
| `opencode/minimax-m2.1-free` | MiniMax | MiniMax M2 | ✅ | ✅ |
| `opencode/minimax-m2.5-free` | MiniMax | MiniMax M2.5 | ✅ | ✅ |
| `opencode/minimax-m3-free` | MiniMax | MiniMax M3 | ✅ | ✅ |
| `opencode/nemotron-3-ultra-free` | NVIDIA | Nemotron 3 | ✅ | ✅ |
| `opencode/north-mini-code-free` | North | North | ✅ | ❌ |
| `opencode/qwen3.6-plus-free` | Alibaba | Qwen 3.6 | ✅ | ✅ |
| `opencode/ring-2.6-1t-free` | Ring | Ring 2.6 | ✅ | ✅ |
| `opencode/trinity-large-preview-free` | Trinity | Trinity | ✅ | ✅ |

### ⚠️ Data Privacy Warning

Free models **may collect and use session data for model improvement**. Per OpenCode Zen documentation:
- Big Pickle
- DeepSeek V4 Flash Free
- Nemotron 3 Super Free

Avoid submitting personal or confidential information when using these specific free endpoints.

---

## 8. Error Handling

### Standard Error Format

Zen errors use a slightly different envelope than OpenAI:

**Zen error format:**
```json
{
  "type": "error",
  "error": {
    "type": "AuthError",
    "message": "Invalid API key."
  }
}
```

**OpenAI error format (what clients expect):**
```json
{
  "error": {
    "message": "Invalid API key.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

### Common Error Types

| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| `AuthError` | 401 | Invalid or missing API key |
| `RateLimitError` | 429 | Too many requests |
| `InvalidModelError` | 404 | Model not found or unavailable |
| `ContextLengthExceeded` | 400 | Input exceeds model's context window |
| `ServerError` | 500 | Internal server error |
| `ProviderError` | 502 | Downstream provider error |

---

## 9. Provider Routing

The Zen API uses a sophisticated routing system to determine which downstream provider to call. This is handled by the `ProviderHelper` abstraction in the OpenCode source code.

### Routing Logic (reconstructed)

```
Request arrives with: model="opencode/deepseek-v4-flash-free"

1. Strip "opencode/" prefix -> "deepseek-v4-flash-free"
2. Look up model -> family="deepseek-v4", provider="deepseek"
3. Select ProviderHelper:
   - openai     -> OpenAIHelper (uses /v1/chat/completions)
   - anthropic  -> AnthropicHelper (uses /v1/messages)
   - google     -> GoogleHelper (uses /v1/models/gemini:...)
   - openai-compatible -> OpenAICompatibleHelper
4. Transform request: OpenAI format -> Provider format
5. Forward to downstream provider URL
6. Transform response: Provider format -> OpenAI format
7. Track usage and return to client
```

### Provider Helper Interface

```typescript
interface ProviderHelper {
  // Transform request to provider format
  fromCommonRequest(commonReq: CommonRequest): ProviderRequest;
  
  // Transform response to common format
  toCommonResponse(providerRes: ProviderResponse): CommonResponse;
  
  // Inject authentication headers
  modifyHeaders(headers: Headers, apiKey: string, stickyId: string): void;
  
  // Parse usage from provider response
  parseUsage(providerRes: ProviderResponse): Usage;
}
```

---

## 10. Pricing & Free Tiers

### Free Model Pricing
- **Cost:** $0.00 per token
- **Limitations:** May have rate limits. Not specified publicly.
- **Data Usage:** May be used for model improvement
- **Duration:** Promotional period (no end date specified)

### Paid Model Pricing
- **Structure:** Pay-as-you-go, billed per 1M tokens
- **Markup:** "At cost" + transaction fees (4.4% + $0.30)
- **Auto-reload:** Auto-reloads $20 when balance drops below $5
- **Spending limits:** Configurable monthly caps

### BYOK (Bring Your Own Key)
- Users can provide their own OpenAI/Anthropic API keys
- Billing goes directly through the provider
- Zen adds no markup in this mode

---

## Key Takeaways for the Proxy Implementation

1. **Zen IS a proxy itself** - Our proxy adds another layer on top, providing:
   - Model alias resolution (without `opencode/` prefix)
   - Error format normalization (Zen -> OpenAI)
   - Documentation/listing of free models
   - Local model caching (planned)

2. **Streaming passthrough** - Zen already uses OpenAI SSE format, so streaming can be forwarded with minimal modification.

3. **Error normalization** - Our proxy must convert Zen's error format to OpenAI's format for maximum compatibility.

4. **Model ID handling** - Accept both `opencode/deepseek-v4-flash-free` and `deepseek-v4-flash-free` formats.

5. **Authentication** - Either pass through the client's API key or use a server-configured key.

---

## References

- [OpenCode Zen Documentation](https://opencode.ai/docs/zen/)
- [OpenCode GitHub (Archived)](https://github.com/opencode-ai/opencode)
- [OpenCode GitHub (Active)](https://github.com/anomalyco/opencode)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Bifrost - OpenCode Provider Docs](https://docs.getbifrost.ai/providers/supported-providers/opencode)

---

*This reverse engineering analysis was performed by examining the public OpenCode source code, official API documentation, and community resources. No proprietary or private information was accessed.*

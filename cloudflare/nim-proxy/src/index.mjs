const defaultBaseUrl = 'https://integrate.api.nvidia.com/v1';

const getAllowedOrigins = (env) =>
  String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const getCorsOrigin = (request, env) => {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = getAllowedOrigins(env);

  if (allowedOrigins.length === 0) {
    return origin || '*';
  }

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  return '';
};

const createCorsHeaders = (request, env) => {
  const origin = getCorsOrigin(request, env);
  const headers = new Headers();
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
};

const withCors = (response, request, env) => {
  const headers = new Headers(response.headers);
  const corsHeaders = createCorsHeaders(request, env);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

const jsonResponse = (payload, init = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
};

const errorResponse = (message, status = 400) =>
  jsonResponse(
    {
      error: {
        message,
        status
      }
    },
    { status }
  );

const chatModelExcludePatterns = [
  /embed/i,
  /embedding/i,
  /rerank/i,
  /rank/i,
  /reward/i,
  /moderation/i,
  /guard/i,
  /safety/i,
  /ocr/i,
  /asr/i,
  /transcribe/i,
  /tts/i,
  /speech/i,
  /audio/i,
  /clip/i,
  /vision/i,
  /vlm/i,
  /image/i
];

const chatModelPriorityPatterns = [/instruct/i, /chat/i, /assistant/i, /coder/i, /reason/i, /r1/i, /it$/i];
const modelProbeCache = new Map();
const modelProbeTtlMs = 1000 * 60 * 30;
const modelProbeConcurrency = 6;
const modelProbeCandidateLimit = 40;

const ensureOriginAllowed = (request, env) => {
  const allowedOrigins = getAllowedOrigins(env);
  const origin = request.headers.get('Origin') || '';
  if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
    return errorResponse('Origin not allowed.', 403);
  }
  return null;
};

const getBaseUrl = (env) => String(env.NVIDIA_NIM_BASE_URL || defaultBaseUrl).replace(/\/$/, '');

const getApiHeaders = (env) => ({
  Authorization: `Bearer ${env.NVIDIA_NIM_API_KEY}`,
  Accept: 'application/json'
});

const isLikelyChatModel = (id) => {
  const value = String(id || '').trim();
  if (!value) return false;
  if (chatModelExcludePatterns.some((pattern) => pattern.test(value))) return false;
  return true;
};

const compareModelPriority = (left, right) => {
  const leftId = String(left?.id || '');
  const rightId = String(right?.id || '');
  const leftPriority = chatModelPriorityPatterns.some((pattern) => pattern.test(leftId)) ? 0 : 1;
  const rightPriority = chatModelPriorityPatterns.some((pattern) => pattern.test(rightId)) ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return leftId.localeCompare(rightId);
};

const readCachedProbe = (id) => {
  const cached = modelProbeCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > modelProbeTtlMs) {
    modelProbeCache.delete(id);
    return null;
  }
  return cached.ok;
};

const writeCachedProbe = (id, ok) => {
  modelProbeCache.set(id, {
    ok,
    timestamp: Date.now()
  });
};

const probeChatModel = async (env, modelId) => {
  const cached = readCachedProbe(modelId);
  if (cached !== null) {
    return cached;
  }

  try {
    const upstream = await fetch(`${getBaseUrl(env)}/chat/completions`, {
      method: 'POST',
      headers: {
        ...getApiHeaders(env),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
        stream: true,
        max_tokens: 8,
        temperature: 0
      })
    });

    const ok = upstream.ok;
    if (ok) {
      await upstream.body?.cancel();
    } else {
      await upstream.text();
    }

    writeCachedProbe(modelId, ok);
    return ok;
  } catch {
    writeCachedProbe(modelId, false);
    return false;
  }
};

const collectAvailableChatModels = async (env, models) => {
  const candidates = models
    .filter((item) => isLikelyChatModel(item.id))
    .sort(compareModelPriority)
    .slice(0, modelProbeCandidateLimit);
  const available = [];

  for (let index = 0; index < candidates.length; index += modelProbeConcurrency) {
    const batch = candidates.slice(index, index + modelProbeConcurrency);
    const results = await Promise.all(
      batch.map(async (model) => ({
        model,
        ok: await probeChatModel(env, model.id)
      }))
    );

    for (const result of results) {
      if (result.ok) {
        available.push(result.model);
      }
    }
  }

  return available;
};

const parseUpstreamError = async (response) => {
  const text = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(text);
  } catch {}

  return {
    text,
    payload,
    status: response.status
  };
};

const normalizedUpstreamError = async (response, fallbackMessage) => {
  const upstream = await parseUpstreamError(response);
  const detail =
    upstream.payload?.error?.message ||
    upstream.payload?.detail ||
    upstream.payload?.title ||
    upstream.text ||
    fallbackMessage;

  let message = fallbackMessage;

  if (upstream.status === 404) {
    message = 'This model is unavailable for chat right now.';
  } else if (upstream.status === 401 || upstream.status === 403) {
    message = 'The assistant is unavailable right now.';
  } else if (upstream.status === 429) {
    message = 'The assistant is busy right now. Please try again shortly.';
  } else if (typeof upstream.payload?.error?.message === 'string' && upstream.payload.error.message.trim()) {
    message = upstream.payload.error.message.trim();
  }

  return jsonResponse(
    {
      error: {
        message,
        status: upstream.status,
        detail
      }
    },
    {
      status: upstream.status
    }
  );
};

const normalizeModels = (payload) => {
  const source = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

  return source
    .map((item) => {
      if (typeof item === 'string') {
        return { id: item };
      }

      return {
        id: typeof item?.id === 'string' ? item.id : '',
        object: typeof item?.object === 'string' ? item.object : 'model',
        owned_by: typeof item?.owned_by === 'string' ? item.owned_by : 'nvidia',
        created: Number.isFinite(item?.created) ? item.created : undefined
      };
    })
    .filter((item) => item.id);
};

const normalizeMessages = (messages) =>
  messages
    .filter((item) => item && typeof item.role === 'string' && typeof item.content === 'string')
    .map((item) => ({
      role: item.role,
      content: item.content
    }));

export default {
  async fetch(request, env) {
    if (!env.NVIDIA_NIM_API_KEY) {
      return withCors(errorResponse('NVIDIA_NIM_API_KEY is missing.', 500), request, env);
    }

    const blocked = ensureOriginAllowed(request, env);
    if (blocked) {
      return withCors(blocked, request, env);
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    if (request.method === 'GET' && pathname === '/') {
      return withCors(
        jsonResponse({
          ok: true,
          service: 'allen-nim-proxy',
          routes: ['/models', '/chat']
        }),
        request,
        env
      );
    }

    if (request.method === 'GET' && pathname === '/models') {
      const upstream = await fetch(`${getBaseUrl(env)}/models`, {
        method: 'GET',
        headers: getApiHeaders(env)
      });

      if (!upstream.ok) {
        return withCors(await normalizedUpstreamError(upstream, 'Unable to load models right now.'), request, env);
      }

      const payload = await upstream.json();
      const normalized = normalizeModels(payload);
      const availableModels = await collectAvailableChatModels(env, normalized);
      return withCors(jsonResponse({ data: availableModels }), request, env);
    }

    if (request.method === 'POST' && pathname === '/chat') {
      let input;

      try {
        input = await request.json();
      } catch {
        return withCors(errorResponse('Invalid JSON body.', 400), request, env);
      }

      const model = typeof input?.model === 'string' ? input.model.trim() : '';
      const messages = normalizeMessages(Array.isArray(input?.messages) ? input.messages : []);

      if (!model) {
        return withCors(errorResponse('model is required.', 400), request, env);
      }

      if (!isLikelyChatModel(model)) {
        return withCors(errorResponse('This model is unavailable for chat right now.', 400), request, env);
      }

      if (messages.length === 0) {
        return withCors(errorResponse('messages must contain at least one item.', 400), request, env);
      }

      const payload = {
        model,
        messages,
        stream: true
      };

      if (typeof input.temperature === 'number') {
        payload.temperature = input.temperature;
      }

      if (typeof input.top_p === 'number') {
        payload.top_p = input.top_p;
      }

      if (typeof input.max_tokens === 'number') {
        payload.max_tokens = input.max_tokens;
      }

      const upstream = await fetch(`${getBaseUrl(env)}/chat/completions`, {
        method: 'POST',
        headers: {
          ...getApiHeaders(env),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!upstream.ok || !upstream.body) {
        return withCors(await normalizedUpstreamError(upstream, 'Reply unavailable right now. Please try another model.'), request, env);
      }

      return withCors(
        new Response(upstream.body, {
          status: upstream.status,
          headers: {
            'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        }),
        request,
        env
      );
    }

    return withCors(errorResponse('Not found.', 404), request, env);
  }
};

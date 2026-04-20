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
    .filter((item) => item.id)
    .sort((a, b) => a.id.localeCompare(b.id));
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
        return withCors(
          new Response(await upstream.text(), {
            status: upstream.status,
            headers: {
              'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store'
            }
          }),
          request,
          env
        );
      }

      const payload = await upstream.json();
      return withCors(jsonResponse({ data: normalizeModels(payload) }), request, env);
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
        return withCors(
          new Response(await upstream.text(), {
            status: upstream.status,
            headers: {
              'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store'
            }
          }),
          request,
          env
        );
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

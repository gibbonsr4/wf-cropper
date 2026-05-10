interface Env {
  CONFIG_KV: KVNamespace;
  ADMIN_TOKEN?: string;
}

const KV_KEY = "config";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Length-leak-resistant string compare — avoids early-exit timing differences
// that could be used to probe a secret one byte at a time.
function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET /api/config — read config from KV
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const stored = await env.CONFIG_KV.get(KV_KEY, "text");

    if (!stored) {
      return jsonResponse(200, { templates: [] });
    }

    return new Response(stored, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch {
    return jsonResponse(500, { error: "Failed to read config" });
  }
};

// PUT /api/config — write config to KV
//
// Disabled unless ADMIN_TOKEN is set in the Pages environment. Clients must
// send the same value in an `X-Admin-Token` header. Rejecting requests with
// no token configured (rather than falling open) is deliberate — the previous
// `ALLOW_CONFIG_WRITES` flag enabled an unauthenticated public write endpoint.
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const expectedToken = env.ADMIN_TOKEN;
  if (!expectedToken) {
    return jsonResponse(405, {
      error:
        "Config writes are disabled. Set ADMIN_TOKEN in your Pages environment variables to enable.",
    });
  }

  const providedToken = request.headers.get("X-Admin-Token");
  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    return jsonResponse(401, { error: "Invalid or missing admin token" });
  }

  try {
    const body = await request.text();
    const parsed = JSON.parse(body);

    if (!parsed.templates || !Array.isArray(parsed.templates)) {
      return jsonResponse(400, {
        error: "Invalid config: templates array required",
      });
    }

    await env.CONFIG_KV.put(KV_KEY, body);

    return jsonResponse(200, { ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }
    return jsonResponse(500, { error: "Failed to save config" });
  }
};

interface Env {
  CONFIG_KV: KVNamespace;
}

const KV_KEY = "config";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET /api/config — read config from KV
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const stored = await env.CONFIG_KV.get(KV_KEY, "text");

    if (!stored) {
      return new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response(stored, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to read config" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }
};

// PUT /api/config — write config to KV
// Disabled by default. Set ALLOW_CONFIG_WRITES=true in your Pages environment
// variables (Settings → Variables) to enable the admin/wizard persistence feature.
export const onRequestPut: PagesFunction<Env & { ALLOW_CONFIG_WRITES?: string }> = async ({ request, env }) => {
  if (env.ALLOW_CONFIG_WRITES !== "true") {
    return new Response(
      JSON.stringify({ error: "Config writes are disabled. Set ALLOW_CONFIG_WRITES=true to enable." }),
      { status: 405, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  try {
    const body = await request.text();
    const parsed = JSON.parse(body);

    if (!parsed.templates || !Array.isArray(parsed.templates)) {
      return new Response(
        JSON.stringify({ error: "Invalid config: templates array required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    await env.CONFIG_KV.put(KV_KEY, body);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    const message =
      err instanceof SyntaxError ? "Invalid JSON body" : "Failed to save config";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: err instanceof SyntaxError ? 400 : 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }
};

import type { AppConfig } from "@/types";
import { validateAppConfig } from "./schema";

const API_URL = "/api/config";
const DEFAULT_FILENAME_PATTERN =
  "{basename}__{filenameKey}__{width}x{height}.{ext}";

/**
 * Probe whether the /api/config endpoint is reachable (i.e., the site is
 * deployed with the Cloudflare Pages Function + KV binding). Returns false
 * when the endpoint is missing (404 on static hosting, or an SPA fallback
 * serving index.html from Vite dev). Used by admin/wizard UIs to hide save
 * actions when running static-only.
 */
export async function probeApi(): Promise<boolean> {
  try {
    const response = await fetch(API_URL, { method: "GET" });
    if (!response.ok) {
      // 401/403 = auth wall but the Function is running — treat as available.
      return response.status === 401 || response.status === 403;
    }
    // Must be application/json — rules out SPA fallbacks that return
    // text/html for unknown paths.
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) return false;
    // And the body must parse as JSON with the expected top-level shape.
    const json = await response.json();
    return (
      typeof json === "object" &&
      json !== null &&
      "templates" in json &&
      Array.isArray((json as { templates: unknown }).templates)
    );
  } catch {
    return false;
  }
}

export async function fetchConfig(): Promise<AppConfig | null> {
  const response = await fetch(API_URL);
  if (!response.ok) return null;

  const json = await response.json();
  // Merge the default filenamePattern before validating, so the API can omit
  // it on fresh installs without failing the schema.
  const merged = {
    templates: (json as { templates?: unknown }).templates,
    filenamePattern:
      (json as { filenamePattern?: unknown }).filenamePattern ??
      DEFAULT_FILENAME_PATTERN,
  };

  const result = validateAppConfig(merged);
  if (!result.success) {
    console.warn("[config] /api/config failed schema validation:", result.error);
    return null;
  }
  return result.data;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  // Validate before sending so the admin UI catches bad edits before the
  // round-trip — clearer feedback than a 400 from the Function.
  const result = validateAppConfig(config);
  if (!result.success) {
    throw new Error(result.error);
  }

  const response = await fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result.data),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ??
        `Save failed (HTTP ${response.status})`
    );
  }
}

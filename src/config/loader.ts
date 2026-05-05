import type { AppConfig } from "@/types";
import { defaultConfig } from "./default-config";
import { fetchConfig } from "./api";
import { validateAppConfig } from "./schema";

let cachedConfig: AppConfig | null = null;

/**
 * Resolve the active config from three sources in priority order:
 *   1. KV-backed API (production / Cloudflare Pages)
 *   2. Static `public/config.json` (static-hosting fallback)
 *   3. Built-in defaults
 *
 * Schema-invalid payloads are logged and skipped, so a malformed config
 * never hard-breaks the app — the loader just falls through to the next
 * source.
 */
export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;

  // 1. Try API (KV-backed). `fetchConfig` already validates the response,
  //    so a non-null return is guaranteed to be schema-valid.
  try {
    const apiConfig = await fetchConfig();
    if (apiConfig) {
      cachedConfig = apiConfig;
      return cachedConfig;
    }
  } catch {
    // API unavailable (e.g., local dev without wrangler) — fall through
  }

  // 2. Try static config.json
  try {
    const response = await fetch("/config.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    // Merge the default filenamePattern before validating so static
    // config files can omit it and still pass the schema.
    const merged = {
      templates: (json as { templates?: unknown }).templates,
      filenamePattern:
        (json as { filenamePattern?: unknown }).filenamePattern ??
        defaultConfig.filenamePattern,
    };

    const result = validateAppConfig(merged);
    if (result.success) {
      cachedConfig = result.data;
      return cachedConfig;
    }
    console.warn("[config] /config.json failed schema validation:", result.error);
  } catch {
    // Static file missing or invalid JSON — fall through
  }

  // 3. Built-in defaults
  cachedConfig = defaultConfig;
  return cachedConfig;
}

export function clearConfigCache() {
  cachedConfig = null;
}

import type { AppConfig } from "@/types";
import { validateAppConfig } from "./schema";

const API_URL = "/api/config";
const ADMIN_TOKEN_STORAGE_KEY = "wfCropper.adminToken";
const DEFAULT_FILENAME_PATTERN =
  "{basename}__{filenameKey}__{width}x{height}.{ext}";

function readStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // private mode / blocked storage — token won't persist, but the in-memory
    // value can still be used for the current request.
  }
}

function promptForAdminToken(rejected: boolean): string | null {
  const message = rejected
    ? "Admin token rejected. Re-enter the ADMIN_TOKEN configured in your Cloudflare Pages environment:"
    : "Admin token required to save. Enter the ADMIN_TOKEN configured in your Cloudflare Pages environment:";
  const value = window.prompt(message)?.trim();
  return value && value.length > 0 ? value : null;
}

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
  const body = JSON.stringify(result.data);

  let token = readStoredAdminToken();
  let promptedThisCall = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) {
      token = promptForAdminToken(promptedThisCall);
      promptedThisCall = true;
      if (!token) throw new Error("Admin token required to save");
      writeStoredAdminToken(token);
    }

    const response = await fetch(API_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": token,
      },
      body,
    });

    if (response.ok) return;

    if (response.status === 401) {
      // Stored token is wrong — clear it and re-prompt once.
      writeStoredAdminToken(null);
      token = null;
      continue;
    }

    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ??
        `Save failed (HTTP ${response.status})`
    );
  }

  throw new Error("Admin token rejected");
}

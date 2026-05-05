import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AppConfig } from "@/types";
import { loadConfig, clearConfigCache } from "@/config/loader";
import { saveConfig as apiSaveConfig, probeApi } from "@/config/api";

interface ConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  /**
   * Whether the /api/config endpoint is reachable. False on static-only
   * deployments (e.g., dropping `dist/` on any CDN without Cloudflare Pages
   * Functions + KV). Admin/wizard UIs use this to hide save buttons and
   * surface the "Download JSON" option instead.
   */
  apiAvailable: boolean;
  saveConfig: (config: AppConfig) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

export const ConfigContext = createContext<ConfigContextValue>({
  config: null,
  loading: true,
  error: null,
  saving: false,
  apiAvailable: false,
  saveConfig: async () => {},
  refreshConfig: async () => {},
});

export function useConfig() {
  return useContext(ConfigContext);
}

export function useConfigLoader(): ConfigContextValue {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadConfig();
      setConfig(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Probe the API once on mount (independent of config load, so we know whether
  // the admin UI can save even if the initial config came from fallback).
  useEffect(() => {
    let cancelled = false;
    probeApi().then((ok) => {
      if (!cancelled) setApiAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConfig = useCallback(async (newConfig: AppConfig) => {
    setSaving(true);
    setError(null);
    try {
      await apiSaveConfig(newConfig);
      clearConfigCache();
      setConfig(newConfig);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save config";
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    clearConfigCache();
    await load();
  }, [load]);

  return {
    config,
    loading,
    error,
    saving,
    apiAvailable,
    saveConfig,
    refreshConfig,
  };
}

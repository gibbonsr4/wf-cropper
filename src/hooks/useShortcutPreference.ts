import { useState, useCallback } from "react";

const STORAGE_KEY = "wf-cropper-shortcuts-enabled";

function readPreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return false;
    return true; // default enabled
  } catch {
    return true;
  }
}

/**
 * Persistent boolean preference for enabling/disabling keyboard shortcuts.
 * Stored in localStorage so it survives page reloads. Defaults to enabled.
 *
 * This addresses WCAG 2.1.4 (Character Key Shortcuts) by providing a
 * user-accessible off-switch for the editor's single-key shortcuts.
 */
export function useShortcutPreference() {
  const [enabled, setEnabled] = useState(readPreference);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable — state still toggles in-memory
      }
      return next;
    });
  }, []);

  return { shortcutsEnabled: enabled, toggleShortcuts: toggle };
}

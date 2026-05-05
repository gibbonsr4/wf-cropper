import { useEffect, useRef } from "react";

export interface Shortcut {
  /**
   * Single lowercase key character ("r", "g") OR a named key from
   * KeyboardEvent.key ("ArrowUp", "Escape"). Matched case-insensitively.
   */
  key: string;
  /** Plain-English label shown in the cheatsheet, e.g. "Rotate 90°". */
  label: string;
  /** Grouping header in the cheatsheet, e.g. "Navigation", "View". */
  group?: string;
  /** Require Shift modifier. */
  shift?: boolean;
  /** Require Cmd (mac) / Ctrl (win/linux) modifier. */
  mod?: boolean;
  /** Handler. Call `preventDefault` inside if you want to block browser defaults. */
  onFire: (e: KeyboardEvent) => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Listen for keyboard shortcuts on the window.
 *
 * - Skips when focus is in an input/textarea/select/contentEditable so the
 *   user can still type numbers into width/quality inputs without firing
 *   shortcuts.
 * - Holds the shortcut list in a ref so handlers close over fresh state
 *   without re-binding the listener on every render.
 */
export function useKeyboardShortcuts(
  shortcuts: Shortcut[],
  enabled: boolean = true
): void {
  const ref = useRef(shortcuts);
  // Keep the ref in sync each render without re-binding the global listener.
  useEffect(() => {
    ref.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      for (const sc of ref.current) {
        const keyMatch = sc.key.toLowerCase() === e.key.toLowerCase();
        if (!keyMatch) continue;
        const wantMod = !!sc.mod;
        const hasMod = e.metaKey || e.ctrlKey;
        if (wantMod !== hasMod) continue;
        const wantShift = !!sc.shift;
        const hasShift = e.shiftKey;
        if (wantShift !== hasShift) continue;
        sc.onFire(e);
        break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}

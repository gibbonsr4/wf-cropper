import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Shortcut } from "@/hooks/useKeyboardShortcuts";

interface ShortcutsOverlayProps {
  shortcuts: Shortcut[];
  onClose: () => void;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Map a produced character back to the physical key a US-layout user has
 * to press. E.g. Shift+= produces "+" but the user's eye goes to the "="
 * key cap, so that's the cue we should render. Keeps the badge count
 * consistent with what fingers do.
 */
const PHYSICAL_KEY: Record<string, string> = {
  "+": "=",
  _: "-",
  "?": "/",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "~": "`",
};

function keyLabel(sc: Shortcut): string[] {
  const parts: string[] = [];
  if (sc.mod) parts.push(isMac() ? "⌘" : "Ctrl");
  if (sc.shift) parts.push("Shift");
  const raw = sc.key;
  // When Shift is part of the combo, show the physical (unshifted) key
  // rather than the character it produces.
  const k = sc.shift ? (PHYSICAL_KEY[raw] ?? raw) : raw;
  const friendly =
    k === " "
      ? "Space"
      : k === "Escape"
        ? "Esc"
        : k === "ArrowUp"
          ? "↑"
          : k === "ArrowDown"
            ? "↓"
            : k === "ArrowLeft"
              ? "←"
              : k === "ArrowRight"
                ? "→"
                : k.length === 1
                  ? k.toUpperCase()
                  : k;
  parts.push(friendly);
  return parts;
}

/**
 * Floating cheatsheet listing active shortcuts, grouped by their `group`
 * field. Mount this conditionally from the parent (via `{open && ...}`) so
 * its focus-trap effects and event listeners only exist while visible.
 * Escape dismisses via the focus trap's built-in handler.
 */
export function ShortcutsOverlay({
  shortcuts,
  onClose,
}: ShortcutsOverlayProps) {
  const cardRef = useFocusTrap(onClose);

  const grouped = new Map<string, Shortcut[]>();
  for (const sc of shortcuts) {
    const g = sc.group ?? "General";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(sc);
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* flex-col + max-h on the card so header/footer stay pinned and the
          middle list scrolls when the viewport is short. max-w-2xl gives
          the two-column layout room without letting it sprawl on wide
          monitors. */}
      <div
        ref={cardRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-semibold text-foreground">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-md p-1 text-muted-foreground hover:bg-raised hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* columns-1 at narrow widths, columns-2 from sm up. break-inside
            keeps each group together in a single column instead of
            splitting mid-group across the gutter. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:columns-2 sm:gap-8">
          {Array.from(grouped.entries()).map(([group, list]) => (
            <div key={group} className="mb-5 break-inside-avoid last:mb-0">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-tertiary">
                {group}
              </div>
              <ul className="space-y-1.5">
                {list.map((sc) => (
                  <li
                    key={`${group}-${sc.key}-${sc.mod ? 1 : 0}-${sc.shift ? 1 : 0}`}
                    className="flex items-center justify-between gap-3 text-[13px]"
                  >
                    <span className="text-foreground">{sc.label}</span>
                    <span className="flex flex-shrink-0 gap-1">
                      {keyLabel(sc).map((k, i) => (
                        <kbd
                          key={`${k}-${i}`}
                          className="flex min-w-[26px] items-center justify-center rounded-[4px] border border-border bg-raised px-1.5 py-[3px] text-center text-[11px] font-semibold leading-none tabular-nums text-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="flex-shrink-0 border-t border-border px-5 py-2.5 text-[11px] text-fg-tertiary">
          Press{" "}
          <kbd className="mx-0.5 rounded-[4px] border border-border bg-raised px-1.5 py-0.5 text-[10px] font-semibold leading-none">
            Esc
          </kbd>{" "}
          to close.
        </p>
      </div>
    </div>,
    document.body
  );
}

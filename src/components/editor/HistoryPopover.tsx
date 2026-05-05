import { useEffect, useRef, useState, useCallback } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryPopoverProps {
  /** One label per history entry. Index 0 is the initial state. */
  labels: string[];
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
  /**
   * The trigger element. We read its rect lazily and reposition on
   * scroll / resize so the popover stays anchored even if the viewport
   * changes size or the user scrolls the page behind it. Passing a ref
   * (rather than a static DOMRect) lets us re-derive the position live.
   */
  anchorRef: React.RefObject<HTMLElement | null>;
}

interface PopoverPosition {
  top: number;
  right: number;
}

function computePosition(anchor: HTMLElement): PopoverPosition {
  const rect = anchor.getBoundingClientRect();
  const right = Math.max(8, window.innerWidth - rect.right);
  const estimatedHeight = Math.min(300, window.innerHeight * 0.6 + 48);
  const preferAbove =
    window.innerHeight - rect.bottom - estimatedHeight < 8 &&
    rect.top > estimatedHeight + 8;
  const top = preferAbove ? rect.top - estimatedHeight - 8 : rect.bottom + 4;
  return { top, right };
}

export function HistoryPopover({
  labels,
  currentIndex,
  onJump,
  onClose,
  anchorRef,
}: HistoryPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  // Track which item has visual focus for arrow-key navigation.
  // Starts at the current history index so the user sees their position.
  const [focusedIndex, setFocusedIndex] = useState(currentIndex);
  // Save the element that triggered the popover so we can return focus.
  const previousFocusRef = useRef<Element | null>(null);

  // Recompute position on viewport changes.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const update = () => {
      const el = anchorRef.current;
      if (el) setPosition(computePosition(el));
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, { capture: true });
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  // Auto-focus the listbox on mount and scroll the current row into view.
  useEffect(() => {
    listRef.current?.focus();
    // Scroll the current entry into view.
    const row = listRef.current?.querySelector(
      `[data-index="${currentIndex}"]`
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  // Return focus to trigger on close.
  useEffect(() => {
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Close on outside click. Click-outside ignores the anchor itself
  // so toggling via the trigger doesn't immediately re-open.
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!ref.current) return;
      const target = e.target as Node;
      if (ref.current.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [onClose, anchorRef]);

  const handleSelect = useCallback(
    (index: number) => {
      onJump(index);
      onClose();
    },
    [onJump, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(labels.length - 1, i + 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(0, i - 1));
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(labels.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          handleSelect(focusedIndex);
          break;
      }
    },
    [labels.length, focusedIndex, handleSelect, onClose]
  );

  // Scroll focused item into view when it changes.
  useEffect(() => {
    const row = listRef.current?.querySelector(
      `[data-index="${focusedIndex}"]`
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  if (!position) return null;

  const activeDescendantId = `history-item-${focusedIndex}`;

  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 rounded-md border border-border bg-card shadow-lg"
      style={{ top: position.top, right: position.right }}
    >
      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary">
        History
      </div>
      <ul
        ref={listRef}
        id="history-popover"
        role="listbox"
        aria-label="Edit history"
        aria-activedescendant={activeDescendantId}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="max-h-[60vh] overflow-y-auto py-1 outline-none"
      >
        {labels.map((label, i) => {
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;
          const isFocused = i === focusedIndex;
          return (
            <li
              key={i}
              id={`history-item-${i}`}
              role="option"
              aria-selected={isFocused}
              aria-current={isCurrent ? "step" : undefined}
              data-index={i}
              onClick={() => handleSelect(i)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
                isFocused && "ring-2 ring-inset ring-blue",
                isCurrent
                  ? "bg-blue-soft text-foreground"
                  : isFuture
                    ? "text-fg-tertiary hover:bg-raised hover:text-muted-foreground"
                    : "text-muted-foreground hover:bg-raised hover:text-foreground"
              )}
            >
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                {isCurrent && (
                  <Check
                    className="h-3.5 w-3.5 text-blue"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="flex-1 truncate">{label}</span>
              <span className="flex-shrink-0 text-[10px] tabular-nums text-fg-tertiary">
                {i + 1}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { cn } from "@/lib/utils";

interface ShortcutHintProps {
  /**
   * The key(s) to display. Single key ("R") or a combo ("Shift+?").
   * Caller is responsible for picking the modifier label (⇧, ⌘, Ctrl)
   * appropriate for the environment — use ShortcutTooltipContent for
   * platform-aware rendering.
   */
  keys: string[];
  className?: string;
}

/**
 * Inline <kbd> badges for displaying a keyboard shortcut inside a tooltip.
 * The coloring inverts onto Tooltip's dark background — each kbd uses the
 * tooltip's `background` token as its surface and `foreground` as its text.
 */
export function ShortcutHint({ keys, className }: ShortcutHintProps) {
  return (
    <span className={cn("ml-2 inline-flex gap-1 align-middle", className)}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="min-w-[18px] rounded-[3px] bg-background/15 px-1 py-0 text-center text-[10px] font-semibold leading-[14px] tabular-nums text-background"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

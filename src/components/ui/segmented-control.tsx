import { useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible label if `label` isn't a plain string. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

/**
 * Segmented radio control with full ARIA radio keyboard pattern:
 * - Only the selected option is in the Tab order (roving tabindex)
 * - Left/Right arrow keys move selection between options
 * - Home/End jump to first/last option
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fullWidth,
  size = "md",
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const focusOption = useCallback((index: number) => {
    const group = groupRef.current;
    if (!group) return;
    const buttons = group.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]'
    );
    buttons[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = options.findIndex((o) => o.value === value);
      let nextIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          nextIndex = (currentIndex + 1) % options.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          nextIndex =
            (currentIndex - 1 + options.length) % options.length;
          break;
        case "Home":
          e.preventDefault();
          nextIndex = 0;
          break;
        case "End":
          e.preventDefault();
          nextIndex = options.length - 1;
          break;
      }

      if (nextIndex !== null) {
        onChange(options[nextIndex].value);
        focusOption(nextIndex);
      }
    },
    [options, value, onChange, focusOption]
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-stretch gap-[2px] rounded-[6px] border border-border bg-input p-[2px]",
        fullWidth && "w-full",
        className
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[4px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-0",
              size === "sm"
                ? "h-[22px] px-2 text-[11px]"
                : "h-[26px] px-2.5 text-[12px]",
              fullWidth && "flex-1",
              selected
                ? "bg-raised text-foreground shadow-[0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

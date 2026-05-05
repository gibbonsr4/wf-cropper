import { useState, useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionProps {
  title: ReactNode;
  children: ReactNode;
  /** Right-aligned content in the header (e.g. status text, toggle). */
  headerEnd?: ReactNode;
  /** Defaults to expanded. */
  defaultOpen?: boolean;
  /** Collapsible at all. Defaults to true. */
  collapsible?: boolean;
  /** Visual flavor. `inset` has interior padding; `flush` lets children
   *  bleed to the edges (useful for lists like OutputNavigator). */
  variant?: "inset" | "flush";
  className?: string;
}

export function Section({
  title,
  children,
  headerEnd,
  defaultOpen = true,
  collapsible = true,
  variant = "inset",
  className,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const contentId = `section-${id}`;

  return (
    <div className={cn("border-b border-border last:border-b-0", className)}>
      <div className="flex h-[38px] items-center px-3">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={contentId}
            className="flex flex-1 items-center justify-between text-[12px] font-semibold select-none cursor-pointer rounded-[4px] -mx-1 px-1 py-1 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-inset outline-none"
          >
            <span>{title}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-fg-tertiary transition-transform",
                !open && "-rotate-90"
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="flex-1 text-[12px] font-semibold select-none">
            {title}
          </span>
        )}
        {/* headerEnd lives outside the button so nested interactive
            elements (status chips, toggles) don't create an invalid
            interactive-inside-interactive pattern. */}
        {headerEnd && (
          <span className="ml-2 flex items-center gap-2">{headerEnd}</span>
        )}
      </div>
      {open && (
        <div
          id={contentId}
          className={cn(variant === "inset" && "space-y-3 px-3 pb-3")}
        >
          {children}
        </div>
      )}
    </div>
  );
}

import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToastMessage } from "@/hooks/useStatusToast";

interface StatusToastProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

const iconMap = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const colorMap = {
  success: "text-success",
  error: "text-destructive",
  info: "text-blue",
} as const;

/**
 * Fixed-position toast stack in the bottom-right corner.
 * Uses role="status" + aria-live="polite" so screen readers announce
 * new messages without interrupting the current task.
 */
export function StatusToast({ messages, onDismiss }: StatusToastProps) {
  if (messages.length === 0) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {messages.map((msg) => {
        const Icon = iconMap[msg.type];
        return (
          <div
            key={msg.id}
            className={cn(
              "flex items-start gap-2.5 rounded-md border border-border bg-card px-4 py-3 text-[13px] shadow-lg",
              "animate-in slide-in-from-right-5 fade-in duration-200"
            )}
          >
            <Icon
              className={cn("mt-0.5 h-4 w-4 flex-shrink-0", colorMap[msg.type])}
              aria-hidden="true"
            />
            <span className="flex-1 text-foreground">{msg.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(msg.id)}
              aria-label="Dismiss"
              className="mt-0.5 flex-shrink-0 rounded-[4px] p-0.5 text-fg-tertiary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

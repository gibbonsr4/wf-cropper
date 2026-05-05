import { useId } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual severity of the confirm action. `destructive` colors the
   *  confirm button red (template delete); `default` uses the primary
   *  style for neutral-but-irreversible actions. */
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shared alert-dialog primitive. Focus-trapped, Escape-dismissed,
 * aria-labelledby + aria-describedby wired to unique useId-generated
 * ids so multiple dialogs don't collide.
 *
 * Lives at the top of the portal tree so it overlays every other
 * surface regardless of where it's rendered from.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const trapRef = useFocusTrap(onCancel);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div
        ref={trapRef}
        className="relative z-50 bg-background rounded-lg border shadow-xl p-6 max-w-sm w-full mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3">
          <div
            className={
              variant === "destructive"
                ? "rounded-full bg-destructive/10 p-2 shrink-0"
                : "rounded-full bg-warning/15 p-2 shrink-0"
            }
          >
            <AlertTriangle
              className={
                variant === "destructive"
                  ? "h-5 w-5 text-destructive"
                  : "h-5 w-5 text-warning"
              }
              aria-hidden="true"
            />
          </div>
          <div>
            <h3 id={titleId} className="text-lg font-semibold">
              {title}
            </h3>
            <p
              id={descId}
              className="text-sm text-muted-foreground mt-1"
            >
              {description}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

import { Link } from "react-router";
import { useRef } from "react";
import {
  Check,
  Download,
  Crop as CropIcon,
  Keyboard,
  Undo2,
  Redo2,
  History,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import type { ImageMetadata, Template, TemplateOutput } from "@/types";

interface EditorTopBarProps {
  image: ImageMetadata;
  template: Template;
  /** Only shown when the template has multiple outputs — single-output
   *  templates stop the breadcrumb at the template name. */
  activeOutput?: TemplateOutput;
  completedCount: number;
  totalCount: number;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
  onBack: () => void;
  onShowShortcuts?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Toggle the History popover. The popover reads the trigger's rect
   *  live off `historyButtonRef` below so we don't need to pass a
   *  one-shot DOMRect that would grow stale on resize/scroll. */
  onShowHistory?: () => void;
  historyOpen?: boolean;
  historyCount?: number;
  historyButtonRef?: React.RefObject<HTMLButtonElement | null>;
  /** Compare mode (before/after) */
  compareMode?: boolean;
  onToggleCompare?: () => void;
}

function Crumb({
  children,
  emphasized,
  title,
}: {
  children: React.ReactNode;
  emphasized?: boolean;
  title?: string;
}) {
  return (
    <>
      <span aria-hidden="true" className="text-fg-tertiary">
        ›
      </span>
      <span
        className={
          "truncate " +
          (emphasized ? "font-medium text-foreground" : "text-muted-foreground")
        }
        title={title}
      >
        {children}
      </span>
    </>
  );
}

export default function EditorTopBar({
  image,
  template,
  activeOutput,
  completedCount,
  totalCount,
  canExport,
  exporting,
  onExport,
  onBack,
  onShowShortcuts,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onShowHistory,
  historyOpen,
  historyCount,
  historyButtonRef,
  compareMode,
  onToggleCompare,
}: EditorTopBarProps) {
  const showActiveOutput = totalCount > 1 && activeOutput;
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  // Fallback ref so the popover still has something to anchor against
  // if the parent doesn't supply one. The parent's ref wins when given.
  const fallbackBtnRef = useRef<HTMLButtonElement>(null);
  const historyBtnRef = historyButtonRef ?? fallbackBtnRef;

  return (
    <header className="flex h-[52px] items-center gap-3 border-b border-border bg-card px-4">
      <Link
        to="/"
        onClick={(e) => { e.preventDefault(); onBack(); }}
        className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
      >
        <span
          className="grid h-5 w-5 place-items-center rounded-[5px] text-[13px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #2e80ff, #8b5cf6)",
          }}
          aria-hidden="true"
        >
          <CropIcon className="h-3 w-3" />
        </span>
        <span>WF Cropper</span>
      </Link>

      <div className="flex min-w-0 items-center gap-2 text-[12px]">
        <Crumb title={image.file.name}>{image.file.name}</Crumb>
        <Crumb emphasized={!showActiveOutput}>{template.name}</Crumb>
        {showActiveOutput && <Crumb emphasized>{activeOutput!.name}</Crumb>}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Edit-state utilities: Undo, Redo, History, Keyboard. */}
        {onUndo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onUndo}
                  disabled={!canUndo}
                  aria-label="Undo"
                  className="px-2"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Undo
              <ShortcutHint keys={[isMac ? "⌘" : "Ctrl", "Z"]} />
            </TooltipContent>
          </Tooltip>
        )}
        {onRedo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRedo}
                  disabled={!canRedo}
                  aria-label="Redo"
                  className="px-2"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Redo
              <ShortcutHint keys={[isMac ? "⌘" : "Ctrl", "Shift", "Z"]} />
            </TooltipContent>
          </Tooltip>
        )}
        {onShowHistory && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={historyBtnRef}
                variant="ghost"
                size="sm"
                onClick={onShowHistory}
                aria-label="Edit history"
                aria-expanded={historyOpen}
                aria-controls="history-popover"
                className="px-2"
                disabled={!historyCount || historyCount <= 1}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit history</TooltipContent>
          </Tooltip>
        )}
        {onShowShortcuts && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowShortcuts}
                aria-label="Keyboard shortcuts"
                className="px-2"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Keyboard shortcuts
              <ShortcutHint keys={["Shift", "/"]} />
            </TooltipContent>
          </Tooltip>
        )}
        {onToggleCompare && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCompare}
                aria-label={compareMode ? "Hide original (compare)" : "Show original (compare)"}
                aria-pressed={compareMode}
                className="px-2"
              >
                {compareMode
                  ? <EyeOff className="h-3.5 w-3.5" />
                  : <Eye className="h-3.5 w-3.5" />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {compareMode ? "Showing original" : "Compare with original"}
              <ShortcutHint keys={["Space"]} />
            </TooltipContent>
          </Tooltip>
        )}

        <span
          className="mx-1 h-4 w-px bg-border"
          aria-hidden="true"
        />

        {/* Export status + action — primary CTA on the far right. */}
        <span
          className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          aria-label={`${completedCount} of ${totalCount} outputs ready`}
        >
          <Check
            className="h-3 w-3"
            style={{ color: "var(--success)" }}
            aria-hidden="true"
          />
          {completedCount} of {totalCount} ready
        </span>
        <Button
          size="sm"
          onClick={onExport}
          disabled={!canExport || exporting}
          className="gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? "Exporting…" : totalCount > 1 ? "Export All" : "Export"}
        </Button>
      </div>
    </header>
  );
}

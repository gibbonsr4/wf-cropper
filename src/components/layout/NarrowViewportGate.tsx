import { useEffect, useState, type ReactNode } from "react";
import { Crop as CropIcon, Monitor } from "lucide-react";

interface NarrowViewportGateProps {
  children: ReactNode;
  /**
   * Minimum viewport width (px) required to show the app. Below this,
   * children are replaced by a polite "wider screen needed" message.
   * Default 1024 matches Webflow's own designer gate; the editor's
   * 3-panel layout (260 + main + 320) can't collapse gracefully below
   * that without a full responsive rewrite we haven't invested in.
   */
  minWidth?: number;
}

/**
 * Blocks rendering on devices narrower than `minWidth`, showing a
 * friendly "open this on a wider screen" screen instead. Modeled on
 * Webflow's own mobile-on-designer behavior.
 *
 * Uses matchMedia to react to viewport changes live (so rotating a
 * tablet from portrait to landscape flips the gate without a reload).
 */
export default function NarrowViewportGate({
  children,
  minWidth = 1024,
}: NarrowViewportGateProps) {
  // SSR-safe: assume the viewport is wide enough until the browser says
  // otherwise. Real browsers hit the effect on mount and re-check.
  const [tooNarrow, setTooNarrow] = useState(false);

  useEffect(() => {
    const query = `(max-width: ${minWidth - 1}px)`;
    const mql = window.matchMedia(query);
    const update = () => setTooNarrow(mql.matches);
    update();
    // `change` is the modern event; both Safari 14+ and all evergreens
    // support it. Older Safari used addListener/removeListener.
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [minWidth]);

  if (!tooNarrow) return <>{children}</>;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground"
      role="region"
      aria-labelledby="narrow-gate-heading"
    >
      <div className="max-w-sm text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-[6px] text-white"
            style={{
              background: "linear-gradient(135deg, #2e80ff, #8b5cf6)",
            }}
            aria-hidden="true"
          >
            <CropIcon className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            WF Cropper
          </span>
        </div>
        <div className="mb-5 flex justify-center">
          <Monitor
            className="h-10 w-10 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h1 id="narrow-gate-heading" className="mb-2 text-base font-semibold">
          Switch to a wider screen
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          WF Cropper&apos;s editor is a three-panel layout that needs a
          screen at least {minWidth}&nbsp;px wide. Open this on a desktop,
          laptop, or tablet in landscape mode to start cropping.
        </p>
      </div>
    </div>
  );
}

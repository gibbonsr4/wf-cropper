import { useState, useCallback, useRef, useEffect } from "react";

interface HorizonDrawOverlayProps {
  onComplete: (angleDeg: number) => void;
  onCancel: () => void;
}

type Endpoint = "start" | "end";

/**
 * Horizon-draw tool. Mouse/touch: drag a line along the horizon, the angle
 * is computed on pointer-up. Keyboard: Tab moves focus between the start
 * and end endpoints of a default line; Arrow keys nudge the focused point
 * (±3px, Shift ±15px); Enter applies; Escape cancels.
 *
 * Keyboard mode activates lazily on the first Tab/arrow keypress, so mouse
 * users never see the placeholder line.
 */
export default function HorizonDrawOverlay({
  onComplete,
  onCancel,
}: HorizonDrawOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Shared line state — used by both mouse and keyboard paths.
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);

  // Keyboard-only state
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [focusedEndpoint, setFocusedEndpoint] = useState<Endpoint>("start");

  // Derived: current angle announcement for screen readers. Computed
  // inline rather than stored in state to avoid a render-triggering
  // effect every time start/end change.
  const announce =
    start && end
      ? `Horizon angle ${(Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI)).toFixed(1)} degrees`
      : "";

  const startCircleRef = useRef<SVGCircleElement>(null);
  const endCircleRef = useRef<SVGCircleElement>(null);

  // ── Point extraction ──────────────────────────────────────────────
  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  // ── Mouse / touch handlers ────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const point = getPoint(e);
      if (!point) return;
      setKeyboardMode(false);
      setDrawing(true);
      setStart(point);
      setEnd(point);
    },
    [getPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      if (!drawing) return;
      const point = getPoint(e);
      if (point) setEnd(point);
    },
    [drawing, getPoint]
  );

  const commitLine = useCallback(
    (s: { x: number; y: number }, eP: { x: number; y: number }) => {
      const dx = eP.x - s.x;
      const dy = eP.y - s.y;
      if (Math.sqrt(dx * dx + dy * dy) < 20) {
        onCancel();
        return;
      }
      const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
      onComplete(angleDeg);
    },
    [onComplete, onCancel]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawing || !start || !end) {
      if (!keyboardMode) onCancel();
      return;
    }
    setDrawing(false);
    commitLine(start, end);
  }, [drawing, start, end, keyboardMode, onCancel, commitLine]);

  // ── Keyboard handlers ─────────────────────────────────────────────
  // Initialize a default horizontal line the first time the user hits
  // an arrow or Enter. Placed at ~25% / 75% width, centered vertically.
  const initKeyboardLine = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setStart({ x: Math.round(rect.width * 0.25), y: Math.round(rect.height * 0.5) });
    setEnd({ x: Math.round(rect.width * 0.75), y: Math.round(rect.height * 0.5) });
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      // Enter applies the current line (once one exists).
      if (e.key === "Enter") {
        if (start && end) {
          e.preventDefault();
          commitLine(start, end);
        }
        return;
      }

      // Tab switches endpoints (only meaningful in keyboard mode).
      if (e.key === "Tab") {
        if (!start || !end) {
          e.preventDefault();
          setKeyboardMode(true);
          initKeyboardLine();
          setFocusedEndpoint("start");
          return;
        }
        if (keyboardMode) {
          e.preventDefault();
          setFocusedEndpoint((p) => (p === "start" ? "end" : "start"));
        }
        return;
      }

      // Arrow keys nudge the focused endpoint.
      const isArrow =
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight";
      if (!isArrow) return;

      e.preventDefault();
      // Engage keyboard mode + place the default line on first arrow press.
      if (!start || !end) {
        setKeyboardMode(true);
        initKeyboardLine();
        return;
      }
      setKeyboardMode(true);
      const step = e.shiftKey ? 15 : 3;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      if (focusedEndpoint === "start") {
        setStart((p) => (p ? { x: p.x + dx, y: p.y + dy } : p));
      } else {
        setEnd((p) => (p ? { x: p.x + dx, y: p.y + dy } : p));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [start, end, focusedEndpoint, keyboardMode, initKeyboardLine, onCancel, commitLine]);

  // Focus the correct endpoint's visual marker when keyboard mode engages.
  useEffect(() => {
    if (!keyboardMode) return;
    const target =
      focusedEndpoint === "start" ? startCircleRef.current : endCircleRef.current;
    target?.focus();
  }, [keyboardMode, focusedEndpoint]);

  // Auto-focus the SVG on mount so arrow/Tab keys reach our handler.
  useEffect(() => {
    svgRef.current?.focus();
  }, []);

  return (
    <svg
      ref={svgRef}
      tabIndex={-1}
      className="absolute inset-0 h-full w-full focus:outline-none"
      style={{ zIndex: 10, cursor: keyboardMode ? "default" : "crosshair" }}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      role="dialog"
      aria-modal="true"
      aria-label="Draw a line along the horizon to straighten. Drag with the mouse, or press Tab to place a default line and use arrow keys to adjust its endpoints. Enter applies, Escape cancels."
    >
      {/* Semi-transparent backdrop */}
      <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.2)" />

      {/* Hint text (before any line is placed) */}
      {!drawing && !start && (
        <g>
          <text
            x="50%"
            y="48%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="14"
            fontFamily="system-ui, sans-serif"
            style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.6)" }}
          >
            Drag along the horizon
          </text>
          <text
            x="50%"
            y="56%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255, 255, 255, 0.7)"
            fontSize="11"
            fontFamily="system-ui, sans-serif"
            style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)" }}
          >
            or Tab + arrows for keyboard · Esc cancels
          </text>
        </g>
      )}

      {/* Drawn line */}
      {start && end && (
        <>
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="white"
            strokeWidth={2}
            strokeDasharray="6 4"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))" }}
          />
          {/* Start and end dots — focusable in keyboard mode so screen
              readers can announce focus and users see a ring. */}
          {/* role="button" with movement instructions — the endpoints
              travel in 2D, so `slider` would mislead assistive tech by
              implying a single-axis min/max/value contract. The
              aria-describedby points at the SR-only instruction block
              below so screen readers announce "use arrow keys to move,
              Enter to apply" on focus. */}
          <circle
            ref={startCircleRef}
            cx={start.x}
            cy={start.y}
            r={keyboardMode && focusedEndpoint === "start" ? 7 : 4}
            fill="white"
            stroke={
              keyboardMode && focusedEndpoint === "start"
                ? "var(--blue)"
                : "rgba(0,0,0,0.3)"
            }
            strokeWidth={keyboardMode && focusedEndpoint === "start" ? 2 : 1}
            tabIndex={keyboardMode ? 0 : -1}
            role="button"
            aria-label={`Horizon start point at ${Math.round(start.x)}, ${Math.round(start.y)}`}
            aria-describedby="horizon-instructions"
            style={{ outline: "none" }}
          />
          <circle
            ref={endCircleRef}
            cx={end.x}
            cy={end.y}
            r={keyboardMode && focusedEndpoint === "end" ? 7 : 4}
            fill="white"
            stroke={
              keyboardMode && focusedEndpoint === "end"
                ? "var(--blue)"
                : "rgba(0,0,0,0.3)"
            }
            strokeWidth={keyboardMode && focusedEndpoint === "end" ? 2 : 1}
            tabIndex={keyboardMode ? 0 : -1}
            role="button"
            aria-label={`Horizon end point at ${Math.round(end.x)}, ${Math.round(end.y)}`}
            aria-describedby="horizon-instructions"
            style={{ outline: "none" }}
          />
        </>
      )}

      {/* Keyboard-mode instruction strip */}
      {keyboardMode && start && end && (
        <foreignObject x="50%" y="12" width="1" height="1" overflow="visible">
          <div
            className="pointer-events-none rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium text-foreground shadow"
            style={{ transform: "translateX(-50%)" }}
          >
            Tab: switch · Arrows: nudge (Shift ×5) · Enter: apply
          </div>
        </foreignObject>
      )}

      {/* SR-only keyboard contract — referenced from the endpoint circles
          via aria-describedby. Lives inside a foreignObject sized 1×1 at
          a far-offscreen coordinate so it stays in the a11y tree without
          affecting layout or visual output. */}
      <foreignObject x="-10000" y="-10000" width="1" height="1">
        <div id="horizon-instructions">
          Use arrow keys to nudge the selected endpoint (hold Shift for a
          larger step). Press Tab to switch between the start and end
          endpoints. Press Enter to apply the horizon angle. Press Escape
          to cancel.
        </div>
      </foreignObject>

      {/* Angle announcements while the user adjusts. aria-live="polite"
          so the screen reader speaks updates without interrupting. */}
      <foreignObject x="-10000" y="-10000" width="1" height="1">
        <div aria-live="polite">{announce}</div>
      </foreignObject>
    </svg>
  );
}

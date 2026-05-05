import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NarrowViewportGate from "./NarrowViewportGate";

/**
 * Install a stub `window.matchMedia` that reports whatever `matches`
 * we tell it to. jsdom doesn't implement matchMedia on its own, so
 * the gate would hit an undefined and skip the check without this.
 */
function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    media: "(max-width)",
    addEventListener: (event: string, cb: (e: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.push(cb);
    },
    removeEventListener: (
      event: string,
      cb: (e: MediaQueryListEvent) => void
    ) => {
      if (event === "change") {
        const i = listeners.indexOf(cb);
        if (i !== -1) listeners.splice(i, 1);
      }
    },
    onchange: null,
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  }));
}

describe("NarrowViewportGate", () => {
  it("renders children when viewport is wide enough", () => {
    mockMatchMedia(false);
    render(
      <NarrowViewportGate>
        <div>main app</div>
      </NarrowViewportGate>
    );
    expect(screen.getByText("main app")).toBeTruthy();
    expect(screen.queryByText(/Switch to a wider screen/i)).toBeNull();
  });

  it("shows the too-narrow message when viewport is below minWidth", () => {
    mockMatchMedia(true);
    render(
      <NarrowViewportGate minWidth={1024}>
        <div>main app</div>
      </NarrowViewportGate>
    );
    expect(screen.getByText(/Switch to a wider screen/i)).toBeTruthy();
    expect(screen.queryByText("main app")).toBeNull();
  });

  it("references the configured minWidth in the message", () => {
    mockMatchMedia(true);
    render(
      <NarrowViewportGate minWidth={900}>
        <div>main app</div>
      </NarrowViewportGate>
    );
    // The message should name the required width so users know what
    // threshold they need to cross.
    expect(screen.getByText(/900/)).toBeTruthy();
  });
});

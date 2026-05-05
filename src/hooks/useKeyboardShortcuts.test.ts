import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts, type Shortcut } from "./useKeyboardShortcuts";

function fire(
  key: string,
  opts: { shift?: boolean; meta?: boolean; ctrl?: boolean; target?: Element } = {}
) {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: opts.shift ?? false,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    bubbles: true,
  });
  // When a target is specified, dispatch on it so it becomes `event.target`.
  (opts.target ?? window).dispatchEvent(event);
}

describe("useKeyboardShortcuts", () => {
  it("fires a handler when the matching key is pressed", () => {
    const handler = vi.fn();
    const shortcuts: Shortcut[] = [
      { key: "r", label: "Rotate", onFire: handler },
    ];
    renderHook(() => useKeyboardShortcuts(shortcuts));
    fire("r");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("matches keys case-insensitively", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "R", label: "Rotate", onFire: handler }])
    );
    fire("r");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire when focus is inside an input element", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "r", label: "x", onFire: handler }])
    );
    fire("r", { target: input });
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does not fire when focus is inside a textarea", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "r", label: "x", onFire: handler }])
    );
    fire("r", { target: ta });
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it("requires shift when shift:true is set", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: "?", shift: true, label: "Help", onFire: handler },
      ])
    );
    fire("?", { shift: false });
    expect(handler).not.toHaveBeenCalled();
    fire("?", { shift: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("requires Cmd/Ctrl when mod:true is set", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: "z", mod: true, label: "Undo", onFire: handler },
      ])
    );
    fire("z");
    expect(handler).not.toHaveBeenCalled();
    fire("z", { meta: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("ignores modifier-laden presses when mod:false", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "r", label: "Rotate", onFire: handler }])
    );
    fire("r", { meta: true }); // Cmd+r should NOT fire a plain 'r' shortcut
    expect(handler).not.toHaveBeenCalled();
  });

  it("is disabled when enabled=false", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "r", label: "x", onFire: handler }], false)
    );
    fire("r");
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires only the first matching shortcut", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: "r", label: "One", onFire: h1 },
        { key: "r", label: "Two", onFire: h2 },
      ])
    );
    fire("r");
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).not.toHaveBeenCalled();
  });
});

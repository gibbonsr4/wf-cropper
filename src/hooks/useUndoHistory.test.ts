import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoHistory } from "./useUndoHistory";

describe("useUndoHistory", () => {
  it("starts with a single initial entry and canUndo=false", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.size).toBe(1);
    expect(result.current.index).toBe(0);
  });

  it("push enables undo and increments size", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    act(() => result.current.push("b"));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.size).toBe(2);
    expect(result.current.index).toBe(1);
  });

  it("undo returns the previous value and moves the pointer", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    act(() => result.current.push("b"));
    act(() => result.current.push("c"));
    let restored: string | null = null;
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo steps forward after an undo", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    act(() => result.current.push("b"));
    act(() => result.current.push("c"));
    act(() => {
      result.current.undo();
    });
    let restored: string | null = null;
    act(() => {
      restored = result.current.redo();
    });
    expect(restored).toBe("c");
    expect(result.current.canRedo).toBe(false);
  });

  it("pushing after undo drops the forward branch", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    act(() => result.current.push("b"));
    act(() => result.current.push("c"));
    act(() => {
      result.current.undo();
    });
    act(() => result.current.push("d"));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.size).toBe(3); // a, b, d
    let restored: string | null = null;
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBe("b");
  });

  it("undo at the base returns null and does nothing", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    let restored: string | null = "sentinel";
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it("redo at the tip returns null", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    act(() => result.current.push("b"));
    let restored: string | null = "sentinel";
    act(() => {
      restored = result.current.redo();
    });
    expect(restored).toBeNull();
  });

  it("enforces maxSize by dropping the oldest entry", () => {
    const { result } = renderHook(() => useUndoHistory("a", { maxSize: 3 }));
    act(() => result.current.push("b"));
    act(() => result.current.push("c"));
    act(() => result.current.push("d"));
    expect(result.current.size).toBe(3); // dropped "a"
    // Walk back to the oldest — should now be "b", not "a"
    let restored: string | null = null;
    act(() => {
      restored = result.current.undo();
    });
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBe("b");
    expect(result.current.canUndo).toBe(false);
  });

  describe("jumpTo", () => {
    it("jumps backward to an earlier index and returns the value", () => {
      const { result } = renderHook(() => useUndoHistory("a"));
      act(() => result.current.push("b"));
      act(() => result.current.push("c"));
      act(() => result.current.push("d"));
      let restored: string | null = null;
      act(() => {
        restored = result.current.jumpTo(1);
      });
      expect(restored).toBe("b");
      expect(result.current.index).toBe(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
    });

    it("jumps forward past the current pointer", () => {
      const { result } = renderHook(() => useUndoHistory("a"));
      act(() => result.current.push("b"));
      act(() => result.current.push("c"));
      act(() => {
        result.current.undo(); // pointer is now at b
      });
      let restored: string | null = null;
      act(() => {
        restored = result.current.jumpTo(2); // jump forward to c
      });
      expect(restored).toBe("c");
      expect(result.current.canRedo).toBe(false);
    });

    it("returns null and no-ops when target is the current index", () => {
      const { result } = renderHook(() => useUndoHistory("a"));
      act(() => result.current.push("b"));
      let restored: string | null = "sentinel";
      act(() => {
        restored = result.current.jumpTo(result.current.index);
      });
      expect(restored).toBeNull();
    });

    it("returns null for out-of-range indexes", () => {
      const { result } = renderHook(() => useUndoHistory("a"));
      act(() => result.current.push("b"));
      let restored: string | null = "sentinel";
      act(() => {
        restored = result.current.jumpTo(99);
      });
      expect(restored).toBeNull();
      act(() => {
        restored = result.current.jumpTo(-1);
      });
      expect(restored).toBeNull();
    });

    it("preserves the stack so forward branch stays reachable", () => {
      const { result } = renderHook(() => useUndoHistory("a"));
      act(() => result.current.push("b"));
      act(() => result.current.push("c"));
      act(() => result.current.push("d"));
      act(() => {
        result.current.jumpTo(0); // jump to very start
      });
      expect(result.current.canRedo).toBe(true);
      // Jumping does NOT truncate — forward entries remain redoable.
      let restored: string | null = null;
      act(() => {
        restored = result.current.jumpTo(3);
      });
      expect(restored).toBe("d");
    });
  });

  it("reset clears all history and starts a new timeline", () => {
    const { result } = renderHook(() => useUndoHistory("a"));
    act(() => result.current.push("b"));
    act(() => result.current.push("c"));
    act(() => result.current.reset("x"));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.size).toBe(1);
  });
});

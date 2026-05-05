import { useCallback, useRef, useState } from "react";

export interface UndoHistoryOptions {
  /** Max history entries. Oldest entries fall off once exceeded. */
  maxSize?: number;
}

export interface UndoHistoryApi<T> {
  /** Commit a new snapshot. Clears any forward (redo) branch. */
  push: (value: T) => void;
  /** Step back one entry. Returns the restored value or null at the base. */
  undo: () => T | null;
  /** Step forward one entry. Returns the restored value or null at the tip. */
  redo: () => T | null;
  /** Jump to a specific entry in the stack (used by the history popover).
   *  Returns the value at that index, or null if the index is out of range
   *  or already the current pointer. */
  jumpTo: (index: number) => T | null;
  /** Replace the entire history with a fresh base value. Used on template
   *  swap — that's not undoable, so we start a new timeline. */
  reset: (value: T) => void;
  /** Swap the entire history with an existing stack + index pair. Used by
   *  multi-image editors that park each image's history when switching
   *  away and restore it on return. */
  replace: (state: { stack: T[]; index: number }) => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Current pointer position in the stack (0-based). */
  index: number;
  /** Total stack size. */
  size: number;
  /** Direct read of the stack — used by the history popover to render a
   *  labelled list. Callers should treat the array as read-only. */
  stack: ReadonlyArray<T>;
}

interface HistoryState<T> {
  stack: T[];
  index: number;
}

/**
 * Ring-buffer history hook. Stores up to `maxSize` snapshots of `T` and
 * exposes imperative `undo` / `redo` that return the snapshot to apply.
 *
 * We keep a mirror of the state in a ref so that rapid successive calls
 * (e.g. two undos in a microtask) see the latest committed state rather
 * than the closure-captured one — but render-facing derivations come from
 * the useState value so React's new "no refs in render" rule stays happy.
 */
export function useUndoHistory<T>(
  initial: T,
  options: UndoHistoryOptions = {}
): UndoHistoryApi<T> {
  const maxSize = options.maxSize ?? 50;

  const [state, setState] = useState<HistoryState<T>>({
    stack: [initial],
    index: 0,
  });
  // Kept in sync with `state` via setState's updater form — lets imperative
  // callers chain multiple calls in one tick without reading stale state.
  const ref = useRef<HistoryState<T>>(state);

  const commit = useCallback((next: HistoryState<T>) => {
    ref.current = next;
    setState(next);
  }, []);

  const push = useCallback(
    (value: T) => {
      const { stack, index } = ref.current;
      const base = stack.slice(0, index + 1);
      const next = [...base, value];
      const overflow = next.length - maxSize;
      const trimmed = overflow > 0 ? next.slice(overflow) : next;
      commit({ stack: trimmed, index: trimmed.length - 1 });
    },
    [maxSize, commit]
  );

  const undo = useCallback((): T | null => {
    const { stack, index } = ref.current;
    if (index <= 0) return null;
    const newIdx = index - 1;
    commit({ stack, index: newIdx });
    return stack[newIdx];
  }, [commit]);

  const redo = useCallback((): T | null => {
    const { stack, index } = ref.current;
    if (index >= stack.length - 1) return null;
    const newIdx = index + 1;
    commit({ stack, index: newIdx });
    return stack[newIdx];
  }, [commit]);

  const jumpTo = useCallback(
    (target: number): T | null => {
      const { stack, index } = ref.current;
      if (target < 0 || target >= stack.length) return null;
      if (target === index) return null;
      commit({ stack, index: target });
      return stack[target];
    },
    [commit]
  );

  const reset = useCallback(
    (value: T) => {
      commit({ stack: [value], index: 0 });
    },
    [commit]
  );

  const replace = useCallback(
    (next: { stack: T[]; index: number }) => {
      // Defensive copy so the caller's reference can't mutate our stack.
      commit({ stack: [...next.stack], index: next.index });
    },
    [commit]
  );

  return {
    push,
    undo,
    redo,
    jumpTo,
    reset,
    replace,
    canUndo: state.index > 0,
    canRedo: state.index < state.stack.length - 1,
    index: state.index,
    size: state.stack.length,
    stack: state.stack,
  };
}

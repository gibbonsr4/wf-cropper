import { useEffect, useRef } from "react";

/**
 * Sets document.title while the component is mounted.
 * Restores the previous title on unmount.
 */
export function useDocumentTitle(title: string) {
  const previousTitle = useRef(document.title);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const saved = previousTitle.current;
    return () => {
      document.title = saved;
    };
  }, []);
}

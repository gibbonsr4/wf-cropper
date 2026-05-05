import { useState, useCallback, useEffect, useRef } from "react";
import type { ImageMetadata } from "@/types";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * EXIF orientation note: we deliberately rely on the browser's native
 * image-orientation handling (applied to HTMLImageElement since Chrome 81
 * / Safari 13.4 / Firefox 77, all 2020+). `img.naturalWidth` /
 * `naturalHeight` reflect the oriented dimensions, and `drawImage(img, …)`
 * draws the oriented raster, so downstream canvas ops don't need to know
 * about EXIF. Pre-normalizing via createImageBitmap would force a re-encode
 * that loses quality on JPEGs, which isn't worth it for a non-issue on
 * modern browsers.
 */

function formatFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WebP";
    default:
      return mime;
  }
}

function decodeFile(file: File): Promise<ImageMetadata> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      reject(
        new Error(
          `Unsupported format: ${file.type || "unknown"}. Use JPEG, PNG, or WebP.`
        )
      );
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        file,
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
        format: formatFromMime(file.type),
        objectUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode ${file.name}`));
    };
    img.src = objectUrl;
  });
}

/**
 * Image loader that doubles as a batch queue. Single-file callers use
 * `loadImage` / `image`; batch callers drop many files via `loadImages`
 * and walk through them with `setActiveIndex` / `removeImage`. `image`
 * always reflects the currently active item.
 */
export function useImageLoader() {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [activeIndex, setActiveIndexState] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Shadow of `images` kept in sync via effect (not during render, so
  // the React-19 "no refs in render" rule stays happy). Used solely by
  // the unmount cleanup so we can revoke object URLs without leaving
  // them dangling if the component tears down mid-session.
  const imagesRef = useRef<ImageMetadata[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const m of imagesRef.current) URL.revokeObjectURL(m.objectUrl);
    };
  }, []);

  const loadImage = useCallback(async (file: File) => {
    setError(null);
    try {
      const meta = await decodeFile(file);
      setImages((prev) => {
        for (const old of prev) URL.revokeObjectURL(old.objectUrl);
        return [meta];
      });
      setActiveIndexState(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadImages = useCallback(async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;
    const results = await Promise.allSettled(files.map(decodeFile));
    const metas: ImageMetadata[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") metas.push(r.value);
      else
        errors.push(
          r.reason instanceof Error ? r.reason.message : String(r.reason)
        );
    }
    if (metas.length === 0) {
      setError(errors.join("; ") || "No images could be loaded");
      return;
    }
    setImages((prev) => {
      for (const old of prev) URL.revokeObjectURL(old.objectUrl);
      return metas;
    });
    setActiveIndexState(0);
    if (errors.length > 0) {
      setError(`${errors.length} file(s) skipped: ${errors.join("; ")}`);
    }
  }, []);

  const setActiveIndex = useCallback((i: number) => {
    setImages((list) => {
      setActiveIndexState(
        list.length === 0 ? 0 : Math.max(0, Math.min(list.length - 1, i))
      );
      return list;
    });
  }, []);

  const removeImage = useCallback((i: number) => {
    setImages((list) => {
      if (i < 0 || i >= list.length) return list;
      URL.revokeObjectURL(list[i].objectUrl);
      const next = list.filter((_, idx) => idx !== i);
      setActiveIndexState((prev) =>
        Math.min(prev, Math.max(0, next.length - 1))
      );
      return next;
    });
  }, []);

  const clearImage = useCallback(() => {
    setImages((prev) => {
      for (const m of prev) URL.revokeObjectURL(m.objectUrl);
      return [];
    });
    setActiveIndexState(0);
    setError(null);
  }, []);

  /**
   * Replace one image in the list with a decoded-from-file metadata.
   * Preserves list order + indices (so consumers keyed by position
   * don't need to re-sync), and revokes the old object URL.
   * No-ops if the index is out of range or the file can't be decoded.
   */
  const replaceImageAt = useCallback(
    async (index: number, file: File): Promise<void> => {
      setError(null);
      try {
        const meta = await decodeFile(file);
        let replaced = false;
        setImages((prev) => {
          if (index < 0 || index >= prev.length) {
            URL.revokeObjectURL(meta.objectUrl);
            return prev;
          }
          const old = prev[index];
          const next = prev.slice();
          next[index] = meta;
          URL.revokeObjectURL(old.objectUrl);
          replaced = true;
          return next;
        });
        if (!replaced) {
          // Index went stale between the decode start and the setImages
          // call (e.g., the image was removed). Drop the fresh URL.
          URL.revokeObjectURL(meta.objectUrl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    []
  );

  const image = images[activeIndex] ?? null;

  return {
    image,
    images,
    activeIndex,
    error,
    loadImage,
    loadImages,
    setActiveIndex,
    removeImage,
    replaceImageAt,
    clearImage,
  };
}

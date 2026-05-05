import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  /** Single-file callback — kept for compatibility with the "Replace image"
   *  flow inside the editor where batch doesn't make sense. */
  onFile: (file: File) => void;
  /** Optional multi-file callback. When provided, the drop zone accepts
   *  multiple files and calls this with the full array; otherwise the
   *  first file is handed to `onFile`. */
  onFiles?: (files: File[]) => void;
}

export default function DropZone({ onFile, onFiles }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const multi = !!onFiles;

  const dispatch = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      if (multi && files.length > 1) {
        onFiles!(files);
      } else {
        onFile(files[0]);
      }
    },
    [multi, onFile, onFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      dispatch(e.dataTransfer.files);
    },
    [dispatch]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(e.target.files);
    // Reset so selecting the same file(s) again re-fires change
    e.target.value = "";
  };

  return (
    // The outer div handles drag events (button elements can't receive
    // drag/drop), while the inner button handles click + keyboard.
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "rounded-lg border-2 border-dashed transition-colors",
        isDragging
          ? "border-blue bg-blue-soft"
          : "border-border-strong bg-panel hover:border-blue/40 hover:bg-raised"
      )}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={
          multi
            ? "Upload images. Accepts JPEG, PNG, or WebP files. Drop multiple for batch."
            : "Upload an image. Accepts JPEG, PNG, or WebP files."
        }
        className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg p-12 outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className="grid h-14 w-14 place-items-center rounded-full bg-raised text-muted-foreground"
          aria-hidden="true"
        >
          <Upload className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-medium text-foreground">
            {multi
              ? "Drop images here or click to browse"
              : "Drop an image here or click to browse"}
          </p>
          <p className="mt-1 text-[11px] text-fg-tertiary">
            JPEG, PNG, or WebP
            {multi ? " · drop multiple for batch" : ""}
          </p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple={multi}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

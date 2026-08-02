"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface FileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  onFilesChange?: (files: File[]) => void;
  previewUrls?: string[];
  hint?: string;
}

interface SelectedFile {
  file: File;
  previewUrl: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Mirrors the browser's own `accept` filtering for drag-and-dropped files,
 * so dropping is never more permissive than the file picker. */
function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(",")
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith(".")) return name.endsWith(pattern);
    if (pattern.endsWith("/*")) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  (
    {
      className,
      onFilesChange,
      previewUrls,
      hint,
      multiple,
      accept,
      disabled,
      id,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const [selected, setSelected] = React.useState<SelectedFile[]>([]);
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const describedBy = [ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined;

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    React.useEffect(() => {
      return () => {
        selected.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
      };
    }, [selected]);

    function applyFiles(files: File[]) {
      setSelected(
        files.map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        }))
      );
      onFilesChange?.(files);
    }

    /** Keeps the real `<input type="file">` in sync so uncontrolled consumers
     * that rely on native form submission still send the right files. */
    function syncInputFiles(files: File[]) {
      const input = inputRef.current;
      if (!input || typeof DataTransfer === "undefined") return;
      const dataTransfer = new DataTransfer();
      files.forEach((file) => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      applyFiles(Array.from(e.target.files ?? []));
    }

    function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    }

    function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
    }

    function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const dropped = Array.from(e.dataTransfer?.files ?? []).filter((file) => matchesAccept(file, accept));
      if (dropped.length === 0) return;
      const next = multiple ? dropped : dropped.slice(0, 1);
      syncInputFiles(next);
      applyFiles(next);
    }

    function removeFile(index: number) {
      const next = selected.filter((_, i) => i !== index).map((item) => item.file);
      syncInputFiles(next);
      applyFiles(next);
    }

    const hasFiles = selected.length > 0;
    const status =
      selected.length === 0
        ? ""
        : selected.length === 1
          ? `${selected[0].file.name} selected`
          : `${selected.length} files selected`;

    return (
      <div>
        <input
          id={inputId}
          ref={setRefs}
          type="file"
          multiple={multiple}
          accept={accept}
          disabled={disabled}
          className="peer sr-only"
          onChange={handleChange}
          aria-describedby={describedBy}
          {...props}
        />
        <label
          htmlFor={inputId}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 px-4 text-center transition-[border-color,background-color,box-shadow] duration-150",
            hasFiles ? "py-5" : "py-7",
            "hover:border-brand-300 hover:bg-brand-50/50",
            "peer-focus-visible:border-brand-600 peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100",
            "peer-[aria-invalid=true]:border-red-400 peer-[aria-invalid=true]:bg-red-50/40",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
            isDragging && "border-brand-500 bg-brand-50 ring-4 ring-brand-100",
            className
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-ink-200 transition-[box-shadow,transform] duration-150 group-hover:ring-brand-300 motion-reduce:transition-none",
              isDragging && "scale-110 ring-brand-400"
            )}
          >
            <Icon
              name={hasFiles ? "check" : "upload"}
              size="sm"
              strokeWidth={1.5}
              className={hasFiles ? "text-brand-600" : "text-ink-500"}
            />
          </div>
          <span className="text-sm text-ink-600">
            {isDragging ? (
              <span className="font-semibold text-brand-700">Drop to upload</span>
            ) : hasFiles ? (
              <>
                <span className="font-semibold text-brand-700">Click to replace</span> or drop{" "}
                {multiple ? "new files" : "a new file"}
              </>
            ) : (
              <>
                <span className="font-semibold text-brand-700">Click to upload</span> or drag and drop
              </>
            )}
          </span>
          {hint && (
            <span id={hintId} className="text-xs text-ink-400">
              {hint}
            </span>
          )}
        </label>
        <span aria-live="polite" className="sr-only">
          {status}
        </span>
        {hasFiles && (
          <ul className="mt-3 space-y-2" aria-label="Selected files">
            {selected.map((item, index) => (
              <li
                key={`${item.file.name}-${item.file.lastModified}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white py-2 pl-2 pr-2 shadow-xs animate-[var(--animate-slide-up)]"
              >
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-ink-200"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50 ring-1 ring-ink-200">
                    <Icon name="document" size="sm" className="text-ink-400" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-800">{item.file.name}</span>
                  <span className="block text-xs text-ink-400">{formatFileSize(item.file.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${item.file.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
                >
                  <Icon name="close" size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!hasFiles && (previewUrls?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="File previews">
            {previewUrls!.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src + i}
                src={src}
                alt={`File preview ${i + 1}`}
                className="h-16 w-16 rounded-lg object-cover shadow-xs ring-1 ring-ink-200"
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);
FileInput.displayName = "FileInput";

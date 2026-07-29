"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  onFilesChange?: (files: File[]) => void;
  previewUrls?: string[];
  hint?: string;
}

export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  (
    {
      className,
      onFilesChange,
      previewUrls,
      hint,
      multiple,
      id,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const [localPreviews, setLocalPreviews] = React.useState<string[]>([]);
    const [fileName, setFileName] = React.useState<string | null>(null);
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const describedBy = [ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined;

    React.useEffect(() => {
      return () => {
        localPreviews.forEach((url) => URL.revokeObjectURL(url));
      };
    }, [localPreviews]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const files = Array.from(e.target.files ?? []);
      onFilesChange?.(files);
      setFileName(files.length === 1 ? files[0].name : files.length > 1 ? `${files.length} files selected` : null);
      setLocalPreviews(files.filter((file) => file.type.startsWith("image/")).map((file) => URL.createObjectURL(file)));
    }

    const previews = fileName ? localPreviews : (previewUrls ?? []);

    return (
      <div>
        <input
          id={inputId}
          ref={ref}
          type="file"
          multiple={multiple}
          className="peer sr-only"
          onChange={handleChange}
          aria-describedby={describedBy}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 px-4 py-7 text-center transition-colors duration-150",
            "hover:border-brand-300 hover:bg-brand-50/50",
            "peer-focus-visible:border-brand-600 peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100",
            "peer-[aria-invalid=true]:border-red-400 peer-[aria-invalid=true]:bg-red-50/40",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
            className
          )}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-ink-200 transition-colors group-hover:ring-brand-300">
            <svg className="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v12"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-ink-700" aria-live="polite">
            {fileName ?? (multiple ? "Upload files" : "Upload a file")}
          </span>
          {hint && <span id={hintId} className="text-xs text-ink-400">{hint}</span>}
        </label>
        {previews.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="File previews">
            {previews.map((src, i) => (
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

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  onFilesChange?: (files: File[]) => void;
  previewUrls?: string[];
  hint?: string;
}

export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  ({ className, onFilesChange, previewUrls, hint, multiple, ...props }, ref) => {
    const [localPreviews, setLocalPreviews] = React.useState<string[]>([]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const files = Array.from(e.target.files ?? []);
      onFilesChange?.(files);
      setLocalPreviews(files.filter((f) => f.type.startsWith("image/")).map((f) => URL.createObjectURL(f)));
    }

    const previews = localPreviews.length > 0 ? localPreviews : previewUrls ?? [];

    return (
      <div>
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 px-4 py-6 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40",
            className
          )}
        >
          <svg className="h-6 w-6 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v12" />
          </svg>
          <span className="text-sm font-medium text-ink-700">
            {multiple ? "Upload files" : "Upload a file"}
          </span>
          {hint && <span className="text-xs text-ink-400">{hint}</span>}
          <input ref={ref} type="file" multiple={multiple} className="hidden" onChange={handleChange} {...props} />
        </label>
        {previews.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src + i} src={src} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-ink-200" />
            ))}
          </div>
        )}
      </div>
    );
  }
);
FileInput.displayName = "FileInput";

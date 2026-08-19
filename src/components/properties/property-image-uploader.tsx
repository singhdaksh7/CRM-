"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, X, RotateCcw, ImageIcon, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { useStorageCapabilities } from "@/components/storage/use-storage-capabilities";
import { StorageDisabledState } from "@/components/storage/storage-disabled-state";
import { optimizePropertyImageFile } from "@/lib/client-image-optimize";
import { describeDirectUploadFailure } from "@/lib/direct-upload-errors";
import { cn } from "@/lib/utils";

type QueueStatus = "waiting" | "optimizing" | "authorizing" | "uploading" | "confirming" | "uploaded" | "failed" | "removed";

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  progress: number;
  error?: string;
  isCover: boolean;
}

function friendlyError(status: number | undefined, raw: string): string {
  if (status === 413) return "The image is larger than the allowed limit.";
  if (status === 415 || raw.toLowerCase().includes("mime") || raw.toLowerCase().includes("extension")) return "This file type is not supported.";
  if (status === 400 && raw.toLowerCase().includes("signature")) return "The image could not be verified.";
  if (status === 503) return "Storage is not configured.";
  if (status === 410) return "Upload session expired. Please retry.";
  return "Upload failed. Please try again.";
}

export function PropertyImageUploader({ propertyId, onUploaded }: { propertyId: string; onUploaded?: () => void }) {
  const { capabilities, loading } = useStorageCapabilities();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxBytes = capabilities?.propertyImages.maxSizeBytes ?? 10 * 1024 * 1024;
  const allowedMimes = capabilities?.propertyImages.allowedMimeTypes ?? ["image/jpeg", "image/png", "image/webp"];
  const uploadsEnabled = !!capabilities?.propertyImages.enabled;

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const items: QueueItem[] = [];
      for (const file of Array.from(files)) {
        let error: string | undefined;
        if (!allowedMimes.includes(file.type)) error = "This file type is not supported.";
        else if (file.size > maxBytes * 2) error = "The image is larger than the allowed limit."; // allow larger originals; optimize will shrink
        items.push({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: error ? "failed" : "waiting",
          progress: 0,
          error,
          isCover: false,
        });
      }
      setQueue((q) => [...q, ...items]);
    },
    [allowedMimes, maxBytes]
  );

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function uploadItem(item: QueueItem) {
    if (item.status === "failed" && item.error && (item.error.includes("not supported") || item.error.includes("larger than"))) return;
    updateItem(item.id, { status: "optimizing", progress: 5, error: undefined });

    try {
      const optimized = await optimizePropertyImageFile(item.file);
      if (optimized.optimizedBytes > maxBytes) {
        updateItem(item.id, { status: "failed", error: "The image is larger than the allowed limit." });
        return;
      }

      updateItem(item.id, { status: "authorizing", progress: 15 });
      const authRes = await fetch(`/api/properties/${propertyId}/media/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: optimized.fileName,
          mimeType: optimized.mimeType,
          sizeBytes: optimized.optimizedBytes,
          purpose: "IMAGE",
          isCover: item.isCover,
          width: optimized.width,
          height: optimized.height,
        }),
      });

      if (!authRes.ok) {
        const body = await authRes.json().catch(() => ({}));
        updateItem(item.id, { status: "failed", error: friendlyError(authRes.status, body.error ?? "") });
        return;
      }

      const auth = await authRes.json();

      if (auth.method === "SERVER_MEDIATED" || !auth.uploadUrl) {
        // Firebase / mediated path - fall back to multipart through existing route.
        updateItem(item.id, { status: "uploading", progress: 30 });
        const form = new FormData();
        form.append("file", new File([optimized.blob], optimized.fileName, { type: optimized.mimeType }));
        form.append("purpose", "IMAGE");
        if (item.isCover) form.append("isCover", "true");
        const res = await fetch(`/api/properties/${propertyId}/images`, { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          updateItem(item.id, { status: "failed", error: friendlyError(res.status, body.error ?? "") });
          return;
        }
        updateItem(item.id, { status: "uploaded", progress: 100 });
        onUploaded?.();
        return;
      }

      updateItem(item.id, { status: "uploading", progress: 25 });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", auth.uploadUrl);
        xhr.setRequestHeader("Content-Type", optimized.mimeType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) updateItem(item.id, { progress: 25 + Math.round((e.loaded / e.total) * 55) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(describeDirectUploadFailure(xhr.status)));
        };
        xhr.onerror = () => reject(new Error("Upload failed before a storage response (often CORS or a blocked network request). Please try again."));
        xhr.send(optimized.blob);
      });

      updateItem(item.id, { status: "confirming", progress: 90 });
      const confirmRes = await fetch(`/api/properties/${propertyId}/media/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: auth.sessionId, width: optimized.width, height: optimized.height }),
      });
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        updateItem(item.id, { status: "failed", error: friendlyError(confirmRes.status, body.error ?? "") });
        return;
      }

      updateItem(item.id, { status: "uploaded", progress: 100 });
      onUploaded?.();
    } catch (err) {
      updateItem(item.id, { status: "failed", error: err instanceof Error ? err.message : "Upload failed. Please try again." });
    }
  }

  function uploadAllWaiting() {
    queue.filter((i) => i.status === "waiting").forEach((item) => {
      void uploadItem(item);
    });
  }

  function removeItem(id: string) {
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  function toggleCover(id: string) {
    setQueue((q) => q.map((it) => ({ ...it, isCover: it.id === id ? !it.isCover : false })));
  }

  if (loading) return null;
  if (!uploadsEnabled) return <StorageDisabledState compact />;

  const busyCount = queue.filter((i) => ["optimizing", "authorizing", "uploading", "confirming"].includes(i.status)).length;
  const waitingCount = queue.filter((i) => i.status === "waiting").length;
  const doneCount = queue.filter((i) => i.status === "uploaded").length;

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add property images, drag and drop or press Enter to browse files"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragActive ? "border-[#4F8CFF] bg-[rgba(79,140,255,0.06)]" : "border-[rgba(255,255,255,0.14)] bg-[#11151F] hover:border-[rgba(255,255,255,0.25)]"
        )}
      >
        <UploadCloud className="h-7 w-7 text-[#4F8CFF]" />
        <p className="text-sm font-semibold text-[#F8FAFC]">Drag and drop images, or click to browse</p>
        <p className="text-xs text-[#94A3B8]">JPEG, PNG or WebP · optimized to WebP · up to {Math.round(maxBytes / (1024 * 1024))} MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={allowedMimes.join(",")}
          className="sr-only"
          aria-label="Choose image files"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(busyCount > 0 || doneCount > 0) && (
        <p className="text-xs text-[#94A3B8]" aria-live="polite">
          Uploading {doneCount} of {queue.filter((i) => i.status !== "failed" && i.status !== "removed").length}
          {busyCount > 0 ? ` · ${busyCount} in progress` : ""}
        </p>
      )}

      {queue.length > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Selected images">
            {queue.map((item) => (
              <li key={item.id} className="relative overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#11151F]">
                <div className="relative h-24 w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                  {item.status !== "uploaded" && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.file.name}`}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {item.status !== "uploaded" && item.status !== "failed" && (
                    <button
                      type="button"
                      onClick={() => toggleCover(item.id)}
                      aria-pressed={item.isCover}
                      aria-label={`Set ${item.file.name} as cover image`}
                      className={cn("absolute left-1 top-1 rounded-full p-1", item.isCover ? "bg-[#4F8CFF] text-white" : "bg-black/60 text-white hover:bg-black/80")}
                    >
                      <Star className="h-3 w-3" fill={item.isCover ? "currentColor" : "none"} />
                    </button>
                  )}
                </div>
                <div className="p-1.5">
                  <p className="truncate text-[11px] font-medium text-[#CBD5E1]">{item.file.name}</p>
                  <p className="text-[10px] text-[#64748B]">{(item.file.size / 1024).toFixed(0)} KB</p>
                  {["optimizing", "authorizing", "uploading", "confirming"].includes(item.status) && (
                    <ProgressBar value={item.progress} label={`Uploading ${item.file.name}`} className="mt-1" />
                  )}
                  <p className="mt-1 flex items-center gap-1 text-[10px]" aria-live="polite">
                    {item.status === "waiting" && !item.error && <span className="text-[#94A3B8]">Waiting</span>}
                    {item.status === "optimizing" && <span className="text-[#4F8CFF]">Optimizing…</span>}
                    {item.status === "authorizing" && <span className="text-[#4F8CFF]">Authorizing…</span>}
                    {item.status === "uploading" && <span className="text-[#4F8CFF]">Uploading…</span>}
                    {item.status === "confirming" && <span className="text-[#4F8CFF]">Confirming…</span>}
                    {item.status === "uploaded" && <span className="text-[#22C55E]">Uploaded</span>}
                    {item.status === "failed" && <span className="text-[#EF4444]">{item.error}</span>}
                  </p>
                  {item.status === "failed" && !item.error?.includes("not supported") && !item.error?.includes("larger than") && (
                    <button type="button" onClick={() => void uploadItem(item)} className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#4F8CFF] hover:underline">
                      <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {waitingCount > 0 && (
            <Button type="button" size="sm" onClick={uploadAllWaiting}>
              <ImageIcon className="h-3.5 w-3.5" /> Upload {waitingCount} image(s)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

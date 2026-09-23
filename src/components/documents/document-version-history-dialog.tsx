"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, History } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { formatBytes, type DocumentRecord } from "./document-types";

export function DocumentVersionHistoryDialog({ documentId, open, onClose }: { documentId: string | null; open: boolean; onClose: () => void }) {
  const [versions, setVersions] = useState<DocumentRecord[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !documentId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before fetching a newly opened document's history
    setVersions(null);
    setError(null);
    fetch(`/api/documents/${documentId}/versions`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setVersions(data.versions);
        setCurrentId(data.currentVersionId);
      })
      .catch(() => setError("Version history is unavailable right now."));
  }, [open, documentId]);

  async function download(id: string) {
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(res.status === 403 ? "You don't have access to this document." : body.error ?? "The document is no longer available.");
        return;
      }
      const data = await res.json();
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Version History" description="Every version stays protected - download permissions apply to each one.">
      {error && <ErrorState description={error} />}
      {!error && !versions && <LoadingState label="Loading versions..." />}
      {!error && versions && (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-zinc-600 shrink-0" />
                  <span className="font-semibold text-sm text-zinc-900">Version {v.version}</span>
                  {v.id === currentId && <Badge tone="green">Current</Badge>}
                  {v.status === "DELETED" && <Badge tone="slate">Deleted</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-600">{v.originalFilename ?? v.fileName} · {formatBytes(v.fileSizeBytes)}</p>
                <p className="text-xs text-zinc-400">{formatDateTime(v.createdAt)} · {v.uploadedBy?.name ?? "Unknown"}</p>
              </div>
              {v.status !== "DELETED" && (
                <button
                  onClick={() => download(v.id)}
                  disabled={downloadingId === v.id}
                  aria-label={`Download version ${v.version}`}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

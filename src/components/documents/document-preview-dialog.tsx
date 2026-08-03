"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Download, RefreshCw, History, Trash2, FileText, Image as ImageIcon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { CATEGORY_LABELS, ENTITY_LABELS, STATUS_TONE, SENSITIVE_CATEGORIES, formatBytes, type DocumentRecord, type Role } from "./document-types";
import { DocumentVersionHistoryDialog } from "./document-version-history-dialog";

function friendlyDownloadError(status: number, raw: string): string {
  if (status === 403) return "You don't have access to this document.";
  if (status === 410 || raw.toLowerCase().includes("expired")) return "This download link has expired. Please try again.";
  if (status === 404) return "The document is no longer available.";
  if (status === 503) return "File storage is not configured.";
  return "Something went wrong. Please try again.";
}

export function DocumentPreviewDialog({
  document,
  open,
  onClose,
  onChanged,
}: {
  document: DocumentRecord | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const role = (session?.user?.role as Role | undefined) ?? "FIELD_EXECUTIVE";
  const canManage = role === "ADMIN" || role === "DATA_MANAGER";

  const [downloading, setDownloading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  if (!document) return null;
  const isImage = document.fileType.startsWith("image/");

  async function handleDownload() {
    if (!document) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(friendlyDownloadError(res.status, body.error ?? ""));
        return;
      }
      const data = await res.json();
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleReplace(file: File) {
    if (!document) return;
    setReplacing(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("entityType", document.entityType);
      uploadForm.append("entityId", (document.propertyId ?? document.leadId ?? document.ownerId ?? document.dealId ?? document.paymentId) ?? "");
      uploadForm.append("category", document.category);

      // Two-step: upload the new file as its own object first (never touches
      // the current version), then point the replace endpoint at the
      // resulting storageKey so it can create the versioned record and mark
      // this version superseded - a failed step 2 leaves the current
      // document untouched.
      const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: uploadForm });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        toast.error(body.error ? friendlyDownloadError(uploadRes.status, body.error) : "Upload failed. Please try again.");
        return;
      }
      const { document: uploaded } = await uploadRes.json();

      const replaceRes = await fetch(`/api/documents/${document.id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, storageKey: uploaded.storageKey, fileType: file.type, fileSizeBytes: file.size }),
      });
      if (!replaceRes.ok) {
        toast.error("Replacement failed - the original document was kept.");
        return;
      }
      toast.success("Document replaced");
      onChanged();
      onClose();
    } finally {
      setReplacing(false);
    }
  }

  async function handleDelete() {
    if (!document) return;
    if (!confirm(`Remove "${document.originalFilename ?? document.fileName}"? This can be undone by an Admin from the audit log, but it will disappear from normal lists immediately.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete this document.");
        return;
      }
      toast.success("Document deleted");
      onChanged();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title={document.originalFilename ?? document.fileName} description={CATEGORY_LABELS[document.category]}>
        <div className="space-y-4">
          <div className="flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#11151F] py-8">
            {isImage ? <ImageIcon className="h-10 w-10 text-[#4F8CFF]" /> : <FileText className="h-10 w-10 text-[#4F8CFF]" />}
          </div>

          {SENSITIVE_CATEGORIES.has(document.category) && (
            <p className="rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs text-[#FCA5A5]">
              This is a private document and is never shown on a public property catalogue.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Row label="Linked Record" value={ENTITY_LABELS[document.entityType]} />
            <Row label="Version" value={`v${document.version}`} />
            <Row label="File Size" value={formatBytes(document.fileSizeBytes)} />
            <Row label="Uploaded By" value={document.uploadedBy?.name ?? "-"} />
            <Row label="Uploaded" value={formatDateTime(document.createdAt)} />
            <Row label="Expiry" value={document.expiresAt ? formatDateTime(document.expiresAt) : "No expiry"} />
            <div>
              <dt className="text-[#94A3B8]">Status</dt>
              <dd className="mt-0.5"><Badge tone={STATUS_TONE[document.status]}>{document.status}</Badge></dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-[rgba(255,255,255,0.08)] pt-3">
            <Button type="button" size="sm" onClick={handleDownload} loading={downloading} disabled={document.status === "DELETED"}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowVersions(true)}>
              <History className="h-3.5 w-3.5" /> Version History
            </Button>
            {canManage && document.status !== "DELETED" && (
              <>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1E2533] px-3.5 py-2 text-sm font-medium text-[#F8FAFC] hover:bg-[#252D3D]">
                  <RefreshCw className="h-3.5 w-3.5" /> {replacing ? "Replacing..." : "Replace"}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={replacing}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleReplace(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button type="button" size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </Dialog>

      <DocumentVersionHistoryDialog documentId={document.id} open={showVersions} onClose={() => setShowVersions(false)} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#94A3B8]">{label}</dt>
      <dd className="mt-0.5 font-semibold text-[#F8FAFC]">{value}</dd>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, ErrorState, PermissionState } from "@/components/ui/states";
import { useStorageCapabilities } from "@/components/storage/use-storage-capabilities";
import { StorageDisabledState } from "@/components/storage/storage-disabled-state";
import { DocumentList } from "./document-list";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import type { DocumentEntityType, DocumentRecord, Role } from "./document-types";

/**
 * Reusable "documents for this record" panel, embedded into entity detail
 * pages (Property, Lead today - Owner/Deal/Payment have no detail page yet,
 * see AGENTS.md section 14, so this component isn't wired in for them until
 * one exists). Uses GET /api/documents?entityType=&entityId= directly since
 * that route is Admin/Data-Manager only; Field Executives instead rely on
 * the per-document access check to see what they're permitted to.
 */
export function EntityDocumentPanel({ entityType, entityId, title }: { entityType: DocumentEntityType; entityId: string; title: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const { capabilities } = useStorageCapabilities();

  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentRecord | null>(null);

  const canList = role === "ADMIN" || role === "DATA_MANAGER";
  const canUpload = canList; // FIELD_EXECUTIVE upload is category-gated to GENERAL server-side; no dedicated UI entry point here yet

  const load = useCallback(() => {
    if (!canList) return;
    setLoading(true);
    fetch(`/api/documents?entityType=${entityType}&entityId=${entityId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setDocuments(data.documents))
      .catch(() => setError("Could not load documents."))
      .finally(() => setLoading(false));
  }, [entityType, entityId, canList]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount / entity change
    load();
  }, [load]);

  if (!role) return null;
  if (!canList) return <PermissionState title="Documents" description="You do not have permission to view this record's documents." />;

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">{title}</h3>
        {canUpload && capabilities?.documents.enabled && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
        )}
      </div>

      {capabilities && !capabilities.documents.enabled && <StorageDisabledState compact />}
      {error && <ErrorState description={error} />}
      {!error && (capabilities?.documents.enabled ?? true) && (
        <>
          {loading ? (
            <LoadingState label="Loading documents..." />
          ) : documents && documents.length > 0 ? (
            <DocumentList documents={documents} loading={false} onOpen={setSelected} />
          ) : (
            <EmptyState title="No documents yet" description="Upload agreements, verification files, or other records for this item." />
          )}
        </>
      )}

      <DocumentUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={load} defaultEntityType={entityType} defaultEntityId={entityId} />
      <DocumentPreviewDialog document={selected} open={!!selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

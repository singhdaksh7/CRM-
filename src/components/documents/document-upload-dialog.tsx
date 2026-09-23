"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { StageProgress } from "@/components/ui/progress";
import { StorageDisabledState } from "@/components/storage/storage-disabled-state";
import { useStorageCapabilities } from "@/components/storage/use-storage-capabilities";
import { EntityPicker } from "./entity-picker";
import { ENTITY_TYPES, ENTITY_LABELS, CATEGORY_LABELS, SENSITIVE_CATEGORIES, categoriesForRole, type DocumentEntityType, type DocumentCategory, type Role } from "./document-types";

function friendlyError(status: number, raw: string): string {
  if (status === 413) return "The file is larger than 25 MB.";
  if (status === 415 || raw.toLowerCase().includes("mime") || raw.toLowerCase().includes("extension")) return "This file type is not supported.";
  if (status === 400 && raw.toLowerCase().includes("signature")) return "The document could not be verified.";
  if (status === 403) return "You are not permitted to upload documents in this category.";
  if (status === 503) return "Storage is not configured.";
  return "Upload failed. Please try again.";
}

export function DocumentUploadDialog({
  open,
  onClose,
  onUploaded,
  defaultEntityType,
  defaultEntityId,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  defaultEntityType?: DocumentEntityType;
  defaultEntityId?: string;
}) {
  const { data: session } = useSession();
  const role = (session?.user?.role as Role | undefined) ?? "FIELD_EXECUTIVE";
  const { capabilities } = useStorageCapabilities();

  const [entityType, setEntityType] = useState<DocumentEntityType>(defaultEntityType ?? "PROPERTY");
  const [entityId, setEntityId] = useState<string | null>(defaultEntityId ?? null);
  const [category, setCategory] = useState<DocumentCategory>("GENERAL");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "preparing" | "uploading" | "verifying" | "completed" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  const availableCategories = categoriesForRole(role);
  const lockedEntity = !!defaultEntityType;

  function reset() {
    setEntityType(defaultEntityType ?? "PROPERTY");
    setEntityId(defaultEntityId ?? null);
    setCategory("GENERAL");
    setExpiresAt("");
    setFile(null);
    setStage("idle");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }
    if (!entityId) {
      setError(`Please select which ${entityType.toLowerCase()} this document belongs to.`);
      return;
    }
    setError(null);
    setStage("preparing");

    const form = new FormData();
    form.append("file", file);
    form.append("entityType", entityType);
    form.append("entityId", entityId);
    form.append("category", category);
    if (expiresAt) form.append("expiresAt", expiresAt);

    setStage("uploading");
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      setStage("verifying");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStage("failed");
        setError(friendlyError(res.status, body.error ?? ""));
        return;
      }
      setStage("completed");
      toast.success("Document uploaded");
      onUploaded();
      onClose();
      reset();
    } catch {
      setStage("failed");
      setError("Upload failed. Please try again.");
    }
  }

  if (!capabilities) return null;

  return (
    <Dialog open={open} onClose={() => { onClose(); reset(); }} title="Upload Document" description="Add a file to the Document Vault, linked to a record.">
      {!capabilities.documents.enabled ? (
        <StorageDisabledState />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="File" required hint={`PDF, JPEG or PNG · up to ${Math.round(capabilities.documents.maxSizeBytes / (1024 * 1024))} MB`}>
            <input
              type="file"
              required
              aria-label="Choose a document file"
              accept={capabilities.documents.allowedMimeTypes.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-zinc-200 bg-white py-2 px-3 text-sm text-zinc-900 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-zinc-800 hover:file:bg-zinc-200"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Entity Type" required>
              <Select value={entityType} disabled={lockedEntity} onChange={(e) => { setEntityType(e.target.value as DocumentEntityType); setEntityId(null); }}>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{ENTITY_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label={`Linked ${ENTITY_LABELS[entityType]}`} required>
              {lockedEntity ? <Input disabled value={defaultEntityId ?? ""} /> : <EntityPicker entityType={entityType} value={entityId} onChange={(id) => setEntityId(id)} />}
            </Field>
          </div>

          <Field label="Category" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>

          {SENSITIVE_CATEGORIES.has(category) && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="font-semibold text-red-700">Private document</p>
                <p className="mt-0.5">This file contains sensitive information and will never be included in a public property catalogue.</p>
              </div>
            </div>
          )}

          <Field label="Expiry Date"><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>

          {stage !== "idle" && <StageProgress stage={stage} />}
          {error && <p className="text-xs font-medium text-red-700" role="alert">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-zinc-200 pt-3">
            <Button type="button" variant="secondary" onClick={() => { onClose(); reset(); }}>Cancel</Button>
            <Button type="submit" loading={stage === "preparing" || stage === "uploading" || stage === "verifying"}>Upload</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

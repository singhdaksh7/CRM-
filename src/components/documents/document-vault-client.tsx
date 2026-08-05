"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { KpiCard } from "@/components/ui/kpi-card";
import { ErrorState } from "@/components/ui/states";
import { useStorageCapabilities } from "@/components/storage/use-storage-capabilities";
import { StorageDisabledState } from "@/components/storage/storage-disabled-state";
import { DocumentList } from "./document-list";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import { ENTITY_TYPES, ENTITY_LABELS, CATEGORY_LABELS, categoriesForRole, type DocumentEntityType, type DocumentCategory, type DocumentRecord, type Role } from "./document-types";

const PAGE_SIZE = 25;

interface Kpis {
  total: number;
  property: number;
  owner: number;
  deal: number;
  expiringSoon: number;
  recentlyUploaded: number;
}

export function DocumentVaultClient({ role }: { role: Role }) {
  const { capabilities, loading: capsLoading } = useStorageCapabilities();

  const [entityType, setEntityType] = useState<DocumentEntityType | "">("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [skip, setSkip] = useState(0);

  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const buildParams = useCallback(
    (overrides: Record<string, string | number> = {}) => {
      const params = new URLSearchParams();
      if (entityType) params.set("entityType", entityType);
      if (category) params.set("category", category);
      if (debouncedQ) params.set("q", debouncedQ);
      params.set("take", String(PAGE_SIZE));
      params.set("skip", String(skip));
      for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
      return params;
    },
    [entityType, category, debouncedQ, skip]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/documents?${buildParams()}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setDocuments(data.documents);
        setTotal(data.total);
      })
      .catch(() => setError("Could not load documents."))
      .finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load whenever filters/pagination change
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to page 1 whenever filters change
    setSkip(0);
  }, [entityType, category, debouncedQ]);

  useEffect(() => {
    Promise.all(
      [
        fetch(`/api/documents?take=1`).then((r) => r.json()),
        fetch(`/api/documents?entityType=PROPERTY&take=1`).then((r) => r.json()),
        fetch(`/api/documents?entityType=OWNER&take=1`).then((r) => r.json()),
        fetch(`/api/documents?entityType=DEAL&take=1`).then((r) => r.json()),
        fetch(`/api/documents?expiringWithinDays=30&take=1`).then((r) => r.json()),
        fetch(`/api/documents?createdAfter=${encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString())}&take=1`).then((r) => r.json()),
      ].map((p) => p.catch(() => ({ total: 0 })))
    ).then(([totalRes, propRes, ownerRes, dealRes, expiringRes, recentRes]) => {
      setKpis({
        total: totalRes.total ?? 0,
        property: propRes.total ?? 0,
        owner: ownerRes.total ?? 0,
        deal: dealRes.total ?? 0,
        expiringSoon: expiringRes.total ?? 0,
        recentlyUploaded: recentRes.total ?? 0,
      });
    });
  }, []);

  const availableCategories = categoriesForRole(role);
  const uploadsEnabled = capabilities?.documents.enabled ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E7ECF2] pb-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Documents</h1>
          <p className="mt-1 text-sm text-[#596579]">Securely manage property, owner, lead, deal, and payment files</p>
        </div>
        {!capsLoading && uploadsEnabled && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload Document
          </Button>
        )}
      </div>

      {!capsLoading && !uploadsEnabled && <StorageDisabledState />}

      {kpis && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total Documents" value={kpis.total} />
          <KpiCard label="Property Documents" value={kpis.property} />
          <KpiCard label="Owner Documents" value={kpis.owner} />
          <KpiCard label="Deal Documents" value={kpis.deal} />
          <KpiCard label="Expiring Soon" value={kpis.expiringSoon} />
          <KpiCard label="Recently Uploaded" value={kpis.recentlyUploaded} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name..." className="pl-9" aria-label="Search documents" />
        </div>
        <Select value={entityType} onChange={(e) => setEntityType(e.target.value as DocumentEntityType | "")} aria-label="Filter by entity type" className="sm:w-48">
          <option value="">All Entity Types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{ENTITY_LABELS[t]}</option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | "")} aria-label="Filter by category" className="sm:w-48">
          <option value="">All Categories</option>
          {availableCategories.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </Select>
      </div>

      {error ? <ErrorState description={error} action={<Button onClick={load}>Retry</Button>} /> : <DocumentList documents={documents} loading={loading} onOpen={setSelected} />}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-[#8A94A6]">
          <span>Showing {skip + 1}-{Math.min(skip + PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip((s) => s + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      )}

      <DocumentUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={load} />
      <DocumentPreviewDialog document={selected} open={!!selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

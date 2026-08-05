"use client";

import Link from "next/link";
import { FileText, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/utils";
import { CATEGORY_LABELS, ENTITY_LABELS, ENTITY_DETAIL_ROUTE, STATUS_TONE, SENSITIVE_CATEGORIES, formatBytes, type DocumentRecord } from "./document-types";

export function DocumentList({ documents, loading, onOpen }: { documents: DocumentRecord[] | null; loading: boolean; onOpen: (doc: DocumentRecord) => void }) {
  if (loading) return <LoadingState label="Loading documents..." />;
  if (!documents || documents.length === 0) {
    return <EmptyState title="No documents found" description="Try adjusting your filters, or upload a new document to get started." />;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white shadow-xs sm:block">
        <table className="min-w-full divide-y divide-[#E7ECF2] text-sm">
          <thead className="bg-[#FAFBFC] text-left text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">
            <tr>
              <th className="px-4 py-3.5">Document</th>
              <th className="px-4 py-3.5">Category</th>
              <th className="px-4 py-3.5">Linked Record</th>
              <th className="px-4 py-3.5">Version</th>
              <th className="px-4 py-3.5">Uploaded By</th>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">Size</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFF4FF] text-[#596579]">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-[#F3F6FA] transition-colors">
                <td className="px-4 py-3.5">
                  <button onClick={() => onOpen(doc)} className="flex items-center gap-2 text-left font-bold text-[#1B2430] hover:text-[#3366FF]">
                    <FileText className="h-4 w-4 shrink-0 text-[#3366FF]" />
                    <span className="truncate max-w-[220px]">{doc.originalFilename ?? doc.fileName}</span>
                  </button>
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone={SENSITIVE_CATEGORIES.has(doc.category) ? "red" : "slate"}>{CATEGORY_LABELS[doc.category]}</Badge>
                </td>
                <td className="px-4 py-3.5">
                  <LinkedEntityCell doc={doc} />
                </td>
                <td className="px-4 py-3.5">v{doc.version}</td>
                <td className="px-4 py-3.5">{doc.uploadedBy?.name ?? "-"}</td>
                <td className="px-4 py-3.5 text-xs text-[#8A94A6]">{formatDate(doc.createdAt)}</td>
                <td className="px-4 py-3.5 text-xs">{formatBytes(doc.fileSizeBytes)}</td>
                <td className="px-4 py-3.5"><Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge></td>
                <td className="px-4 py-3.5 text-right">
                  <button onClick={() => onOpen(doc)} className="text-xs font-semibold text-[#3366FF] hover:underline">
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 sm:hidden">
        {documents.map((doc) => (
          <li key={doc.id}>
            <button onClick={() => onOpen(doc)} className="block w-full rounded-2xl border border-[#E7ECF2] bg-white p-4 text-left shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-[#3366FF]" />
                  <span className="truncate font-bold text-[#1B2430]">{doc.originalFilename ?? doc.fileName}</span>
                </div>
                <Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#8A94A6]">
                <Badge tone={SENSITIVE_CATEGORIES.has(doc.category) ? "red" : "slate"}>{CATEGORY_LABELS[doc.category]}</Badge>
                <span>v{doc.version}</span>
                <span>·</span>
                <span>{formatBytes(doc.fileSizeBytes)}</span>
                <span>·</span>
                <span>{formatDate(doc.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-xs text-[#8A94A6]">{ENTITY_LABELS[doc.entityType]} · Uploaded by {doc.uploadedBy?.name ?? "-"}</p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function LinkedEntityCell({ doc }: { doc: DocumentRecord }) {
  const id = doc.propertyId ?? doc.leadId ?? doc.ownerId ?? doc.dealId ?? doc.paymentId;
  const route = id ? ENTITY_DETAIL_ROUTE[doc.entityType]?.(id) : undefined;
  if (!route) return <span className="text-xs text-[#8A94A6]">{ENTITY_LABELS[doc.entityType]}</span>;
  return (
    <Link href={route} className="flex items-center gap-1 text-xs text-[#3366FF] hover:underline" onClick={(e) => e.stopPropagation()}>
      {ENTITY_LABELS[doc.entityType]} <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

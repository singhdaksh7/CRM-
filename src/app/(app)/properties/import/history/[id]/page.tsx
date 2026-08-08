import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { ImportRollbackButton } from "@/components/properties/import-rollback-button";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user || !["ADMIN", "DATA_MANAGER"].includes(session.user.role)) redirect("/properties"); const { id } = await params;
  const job = await prisma.importJob.findFirst({ where: { id, organizationId: getOrganizationId(session.user.id), entityType: "PROPERTIES" }, include: { records: { orderBy: { rowNumber: "asc" }, take: 5000 }, createdBy: { select: { name: true } } } }); if (!job) notFound();
  return <div className="space-y-5"><div><Link href="/properties/import/history" className="text-sm text-blue-700">← Import history</Link><h1 className="text-2xl font-bold">{job.fileName}</h1><p className="text-sm text-slate-600">{job.status} · {job.totalRows} rows · {job.createdBy?.name ?? "System"}</p></div><div className="flex gap-2"><a href={`/api/imports/${job.id}/errors`} className="rounded-xl border px-3 py-2 text-sm font-semibold">Download errors CSV</a>{session.user.role === "ADMIN" && !["ROLLED_BACK","RUNNING"].includes(job.status) && <ImportRollbackButton jobId={job.id}/>}</div><div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-xs"><thead className="bg-slate-50 text-left"><tr>{["Row","Action","Status","Duplicate","Property","Validation / error","Before","After"].map((h)=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{job.records.map((record)=><tr className="border-t align-top" key={record.id}><td className="p-3">{record.rowNumber}</td><td className="p-3">{record.action??"—"}</td><td className="p-3">{record.status}</td><td className="p-3">{record.duplicateClass??"—"}</td><td className="p-3">{record.entityId ? <Link className="text-blue-700" href={`/properties/${record.entityId}`}>{record.entityId}</Link>:"—"}</td><td className="max-w-xs p-3">{record.errorMessage??record.validationErrors??record.warnings??"—"}</td><td className="max-w-xs p-3">{record.beforeSummary??"—"}</td><td className="max-w-xs p-3">{record.afterSummary??"—"}</td></tr>)}</tbody></table></div></div>;
}

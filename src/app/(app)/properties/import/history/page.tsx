import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { formatDate } from "@/lib/utils";

export default async function ImportHistoryPage() {
  const session = await auth(); if (!session?.user || !["ADMIN", "DATA_MANAGER"].includes(session.user.role)) redirect("/properties");
  const jobs = await prisma.importJob.findMany({ where: { organizationId: getOrganizationId(session.user), entityType: "PROPERTIES" }, include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return <div className="space-y-5"><div className="flex justify-between"><div><h1 className="text-2xl font-bold">Inventory Import History</h1><p className="text-sm text-slate-600">Auditable row-level results for prior imports.</p></div><Link href="/properties/import" className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">New import</Link></div><div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{["File","Date","Uploaded by","Rows","Created","Updated","Skipped","Failed","Status"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-t"><td className="p-3 font-semibold"><Link className="text-blue-700" href={`/properties/import/history/${job.id}`}>{job.fileName}</Link><p className="text-xs text-slate-500">{job.sheetName}</p></td><td className="p-3">{formatDate(job.createdAt)}</td><td className="p-3">{job.createdBy?.name ?? "System"}</td><td className="p-3">{job.totalRows}</td><td className="p-3">{job.createdRows}</td><td className="p-3">{job.updatedRows}</td><td className="p-3">{job.skippedRows}</td><td className="p-3">{job.failedRows}</td><td className="p-3">{job.status}</td></tr>)}</tbody></table></div></div>;
}

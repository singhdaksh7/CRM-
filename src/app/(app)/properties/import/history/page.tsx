import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { formatDate } from "@/lib/utils";

export default async function ImportHistoryPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "DATA_MANAGER"].includes(session.user.role)) redirect("/properties");

  const jobs = await prisma.importJob.findMany({
    where: { organizationId: getOrganizationId(session.user), entityType: "PROPERTIES" },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Inventory Import History</h1>
          <p className="text-sm text-zinc-500">Auditable row-level results for prior imports.</p>
        </div>
        <Link
          href="/properties/import"
          className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-zinc-800"
        >
          New import
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              {["File", "Date", "Uploaded by", "Rows", "Created", "Updated", "Skipped", "Failed", "Status"].map((h) => (
                <th key={h} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-900">
            {jobs.map((job) => (
              <tr key={job.id} className="transition-colors hover:bg-zinc-50/60">
                <td className="px-4 py-3 font-semibold">
                  <Link className="text-zinc-900 hover:underline" href={`/properties/import/history/${job.id}`}>
                    {job.fileName}
                  </Link>
                  <p className="text-xs font-normal text-zinc-500">{job.sheetName}</p>
                </td>
                <td className="px-4 py-3 text-zinc-600">{formatDate(job.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-600">{job.createdBy?.name ?? "System"}</td>
                <td className="px-4 py-3 font-medium text-zinc-900">{job.totalRows}</td>
                <td className="px-4 py-3 text-zinc-700">{job.createdRows}</td>
                <td className="px-4 py-3 text-zinc-700">{job.updatedRows}</td>
                <td className="px-4 py-3 text-zinc-500">{job.skippedRows}</td>
                <td className="px-4 py-3 text-red-600 font-medium">{job.failedRows}</td>
                <td className="px-4 py-3 font-medium text-zinc-900">{job.status}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No import jobs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

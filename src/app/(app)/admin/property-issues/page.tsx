import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { getPropertyIssues } from "@/lib/property-issues";
import { EmptyState } from "@/components/ui/states";
import { PropertyIssueRow } from "@/components/admin/property-issue-row";

export default async function PropertyIssuesPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session?.user);
  const issuesRaw = await getPropertyIssues(organizationId);
  const issues = issuesRaw.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }));

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Property Issues Queue</h1>
        <p className="mt-1 text-sm text-[#596579]">{issues.length} open issue{issues.length === 1 ? "" : "s"} - availability reports and data-quality reports, all in one place.</p>
      </div>

      {issues.length === 0 ? (
        <EmptyState title="No open property issues" description="Reports submitted by field executives will show up here for review." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {issues.map((issue) => (
            <PropertyIssueRow key={`${issue.issueType}-${issue.id}`} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

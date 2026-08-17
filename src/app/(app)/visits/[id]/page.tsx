import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { loadVisitForActor } from "@/lib/visits";
import { toVisitDetailDTO } from "@/lib/visit-detail-dto";
import { VisitPropertyWorkflow } from "@/components/visits/visit-property-workflow";
import { VisitManageActions } from "@/components/visits/visit-manage-actions";
import { VisitRowActions } from "@/components/visits/visit-row-actions";
import { Badge, VISIT_STATUS_TONE, VISIT_PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { formatDate, formatDateTime, enumToLabel } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { RATING_DESCRIPTIONS } from "@/lib/visits";
import { ArrowLeft, Star } from "lucide-react";

/**
 * Visit Detail. One page, two audiences:
 *   * Admin / Data Manager - client, schedule, catalogue reference, and the
 *     full property list with per-property progress, plus reschedule/cancel.
 *   * The assigned Field Executive - the same context plus the on-site
 *     workflow (Start Visit, per-property Mark Visited / Skip / Unavailable,
 *     star reaction, Complete Visit).
 *
 * Access is enforced by loadVisitForActor: cross-organization and
 * not-your-visit both 404, so an ID cannot be probed.
 */
export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  let visit;
  try {
    visit = await loadVisitForActor(id, getOrganizationId(session.user.id), session.user);
  } catch {
    notFound();
  }

  const dto = toVisitDetailDTO(visit, session.user);

  // Executives available for reassignment - only loaded for managers.
  const employees = dto.can.manage
    ? await prisma.user.findMany({
        where: { organizationId: getOrganizationId(session.user.id), role: "FIELD_EXECUTIVE", status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <div>
        <Link href="/visits" className="inline-flex items-center gap-1 text-sm font-semibold text-[#596579] hover:text-[#3366FF]">
          <ArrowLeft className="h-4 w-4" /> All visits
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">{dto.client.name}</h1>
            <p className="mt-1 text-sm text-[#596579]">
              {formatDate(dto.visitDate)} at {dto.visitTime}
              {dto.assignedTo && <> &middot; {dto.assignedTo.name}</>}
              {" "}&middot; {dto.progress.total} {dto.progress.total === 1 ? "property" : "properties"}
            </p>
          </div>
          <Badge tone={VISIT_STATUS_TONE[dto.status] ?? "slate"}>{enumToLabel(dto.status)}</Badge>
        </div>
      </div>

      {dto.status === "CANCELLED" && dto.cancellationReason && (
        <div className="rounded-2xl border border-[#FFC7C9] bg-[#FFECEC] p-4">
          <p className="text-sm font-bold text-[#E5484D]">Visit cancelled</p>
          <p className="mt-0.5 text-sm text-[#596579]">{dto.cancellationReason}</p>
        </div>
      )}

      {/* CLIENT */}
      <Section title="Client">
        <Row label="Name" value={<Link href={`/leads/${dto.client.leadId}`} className="font-semibold text-[#3366FF] hover:underline">{dto.client.name}</Link>} />
        <Row label="Lead code" value={<span className="font-mono text-xs">{dto.client.leadCode}</span>} />
        {dto.client.phone && <Row label="Phone" value={<a href={`tel:${dto.client.phone}`} className="text-[#3366FF]">{dto.client.phone}</a>} />}
        {dto.client.requirement && <Row label="Requirement" value={dto.client.requirement} />}
        {dto.client.preferredLocation && <Row label="Preferred area" value={dto.client.preferredLocation} />}
      </Section>

      {/* SCHEDULE */}
      <Section title="Schedule">
        <Row label="Date" value={formatDate(dto.visitDate)} />
        <Row label="Time" value={dto.visitTime} />
        <Row label="Assigned to" value={dto.assignedTo?.name ?? "Unassigned"} />
        {dto.meetingLocation && <Row label="Meeting point" value={dto.meetingLocation} />}
        {dto.startedAt && <Row label="Started" value={formatDateTime(dto.startedAt)} />}
        {dto.completedAt && <Row label="Completed" value={formatDateTime(dto.completedAt)} />}
        {dto.overallRating !== null && (
          <Row label="Overall interest" value={<span>{dto.overallRating}/5 &mdash; {RATING_DESCRIPTIONS[dto.overallRating]}</span>} />
        )}
        {dto.completionSummary && <Row label="Summary" value={dto.completionSummary} />}
      </Section>

      {/* CATALOGUE */}
      {dto.catalogue && (
        <Section title="Catalogue">
          <Row
            label="Source"
            value={
              <Link href={`/catalogues/${dto.catalogue.id}/internal`} className="font-semibold text-[#3366FF] hover:underline">
                {dto.catalogue.title} (v{dto.catalogue.version})
              </Link>
            }
          />
        </Section>
      )}

      {/* PROPERTIES */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Properties to visit</h2>
        {dto.can.runFieldWorkflow ? (
          <VisitPropertyWorkflow visit={dto} />
        ) : (
          <div className="space-y-2">
            {dto.properties.map((p) => (
              <div key={p.visitPropertyId} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1B2430]">
                      <span className="mr-1.5 text-[#8A94A6]">{p.sequence + 1}.</span>
                      {p.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[#596579]">
                      {p.area} &middot; {enumToLabel(p.propertyType)} &middot; {p.bhk} BHK
                      {p.floorNumber !== null && <> &middot; Floor {p.floorNumber}</>}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8A94A6]">{p.address}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1B2430]">{p.price ?? "Price on request"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={VISIT_PROPERTY_STATUS_TONE[p.status] ?? "slate"}>{enumToLabel(p.status)}</Badge>
                    <Badge tone={p.isAvailable ? "green" : "red"}>{enumToLabel(p.availabilityStatus)}</Badge>
                    <Badge tone="slate">{p.inventorySource}</Badge>
                  </div>
                </div>
                {p.reactionRating !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-4 w-4 ${n <= p.reactionRating! ? "fill-[#E6A23C] text-[#E6A23C]" : "text-[#C9D2DE]"}`} />
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-[#596579]">
                      Client reaction {p.reactionRating}/5 &mdash; {p.reactionLabel ? enumToLabel(p.reactionLabel) : ""}
                    </span>
                  </div>
                )}
                {p.reactionNote && <p className="mt-1 text-xs text-[#596579]">{p.reactionNote}</p>}
                {p.skipReason && <p className="mt-1 text-xs text-[#E6A23C]">Reason: {p.skipReason}</p>}
                {p.isPreferred && <p className="mt-1 text-xs font-semibold text-[#9333EA]">Client preferred this property</p>}
                {p.negotiationNotes && <p className="mt-2 rounded-lg bg-[#FFF6E5] p-2 text-xs text-[#8A6D3B]">Negotiation: {p.negotiationNotes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {dto.can.manage && dto.status !== "COMPLETED" && dto.status !== "CANCELLED" && (
        <VisitManageActions
          visitId={dto.id}
          visitDate={istDateInputValue(dto.visitDate)}
          visitTime={dto.visitTime}
          assignedToId={dto.assignedTo?.id ?? ""}
          employees={employees}
        />
      )}

      {/* The pre-existing status / outcome / structured VisitFeedback
          controls, kept intact and moved here from the visits list so the
          Phase 2C feedback flow is still reachable. */}
      {dto.can.manage && (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Status &amp; outcome</h2>
          <VisitRowActions visitId={dto.id} status={dto.status} outcome={visit.outcome} />
        </div>
      )}
    </div>
  );
}

/**
 * "YYYY-MM-DD" for an <input type="date">, on the IST calendar.
 * `toISOString().slice(0,10)` would give the UTC calendar day and show the
 * wrong date for any visit stored before 05:30 IST.
 */
function istDateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">{title}</h2>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 text-sm">
      <dt className="w-32 shrink-0 text-[#8A94A6]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[#1B2430]">{value}</dd>
    </div>
  );
}

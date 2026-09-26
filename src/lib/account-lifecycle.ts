import "server-only";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { AUTH_AUDIT_EVENTS } from "./auth-events";
import type { Prisma } from "@prisma/client";

/**
 * Admin enable/disable of an employee account.
 *
 * Disabling is a security action, not just a status flip: it revokes live
 * sessions (via authVersion) and destroys any outstanding credential-bearing
 * link, so a disabled employee cannot get back in with a reset link they were
 * sent five minutes earlier.
 */

type Tx = Prisma.TransactionClient;

/**
 * Decides which status an INACTIVE employee should be re-enabled into.
 *
 * The dangerous mistake is flipping an employee who never chose a password
 * straight to ACTIVE - their `passwordHash` is the random placeholder written
 * at creation (see POST /api/employees), which nobody knows, so the account
 * would be permanently unusable *and* would look fine in the UI.
 *
 * Signal used: an employee who never completed setup still has account setup
 * token rows, none of which was ever consumed. An employee who did complete
 * setup has a consumed one. Employees seeded before the activation feature
 * existed have no token rows at all and real passwords - they correctly fall
 * through to ACTIVE.
 */
export async function hasCompletedAccountSetup(tx: Tx, userId: string): Promise<boolean> {
  const [usedCount, unusedCount] = await Promise.all([
    tx.accountSetupToken.count({ where: { userId, usedAt: { not: null } } }),
    tx.accountSetupToken.count({ where: { userId, usedAt: null } }),
  ]);
  if (usedCount > 0) return true;
  return unusedCount === 0;
}

/**
 * Sets an employee INACTIVE, revokes their sessions, and invalidates every
 * outstanding setup/reset link they hold. Only an ACTIVE employee can be
 * disabled - a PENDING_SETUP employee has no access to revoke and its own
 * controls are the setup-link ones.
 */
export async function disableEmployeeAccount(params: {
  employeeId: string;
  organizationId: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: { id: params.employeeId, organizationId: params.organizationId },
      select: { id: true, status: true, role: true },
    });
    if (!employee) throw new ApiError(404, "Employee not found");
    if (employee.status !== "ACTIVE") throw new ApiError(409, "Only an active employee can be disabled");

    // Never let an admin lock the organization out of itself: disabling
    // yourself, or disabling the last remaining active admin, leaves no one
    // able to re-enable anyone (including themselves) via the admin-only
    // account-status route.
    if (employee.id === params.actorId) {
      throw new ApiError(400, "You cannot disable your own account");
    }
    if (employee.role === "ADMIN") {
      const otherActiveAdmins = await tx.user.count({
        where: { organizationId: params.organizationId, role: "ADMIN", status: "ACTIVE", id: { not: employee.id } },
      });
      if (otherActiveAdmins === 0) {
        throw new ApiError(400, "Cannot disable the only active admin in this organization");
      }
    }

    const disabled = await tx.user.updateMany({
      where: { id: employee.id, organizationId: params.organizationId, status: "ACTIVE" },
      data: { status: "INACTIVE", authVersion: { increment: 1 } },
    });
    if (disabled.count !== 1) throw new ApiError(409, "Only an active employee can be disabled");

    // Outstanding credential-bearing links die with the account. Setup tokens
    // are marked used rather than deleted so `hasCompletedAccountSetup` keeps
    // its history; reset tokens carry no such meaning and are deleted.
    await tx.passwordResetToken.deleteMany({ where: { userId: employee.id } });
    await tx.accountSetupToken.updateMany({
      where: { userId: employee.id, usedAt: null },
      data: { expiresAt: new Date(0) },
    });

    await tx.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.actorId,
        action: "UPDATE",
        entityType: "User",
        entityId: employee.id,
        oldValues: JSON.stringify({ status: "ACTIVE" }),
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.ACCOUNT_DISABLED, status: "INACTIVE" }),
      },
    });
    return { id: employee.id, status: "INACTIVE" as const };
  });
}

// Every User relation that represents real CRM history/ownership - i.e.
// everything except AccountSetupToken/PasswordResetToken, which cascade-
// delete with the user by design (they're just credential-issuance
// bookkeeping, not business history). Kept as an explicit list rather than
// relying on the FK error alone so the admin is told *what* is blocking the
// delete, not just that something is. If a future migration adds a new User
// relation, deleteEmployeeAccount() still fails safely (Prisma raises a P2003
// foreign key error on the delete itself) - it just won't be named up front.
const HISTORY_RELATION_LABELS: Record<string, string> = {
  assignedLeads: "assigned leads",
  assignedVisits: "assigned visits",
  visitConflictOverrides: "visit conflict overrides",
  createdVisits: "visits created",
  visitPropertiesVisited: "visit-property records",
  scheduledCatalogueRequests: "scheduled catalogue requests",
  followUps: "follow-ups",
  activities: "activity log entries",
  sharedProperties: "shared-property log entries",
  leadTransfersFrom: "lead transfers (from)",
  leadTransfersTo: "lead transfers (to)",
  propertiesAdded: "properties added",
  assignmentRules: "lead assignment rules",
  notifications: "notifications",
  whatsappMessagesSent: "WhatsApp messages sent",
  whatsappConversationsAssigned: "WhatsApp conversations assigned",
  cataloguesCreated: "catalogues created",
  catalogueShareProperties: "catalogue share properties",
  ownersCreated: "owners created",
  ownersVerified: "owners verified",
  dealsAssigned: "deals assigned",
  dealsCreated: "deals created",
  brokerageCalculationsMade: "brokerage calculations",
  brokerageIncentives: "brokerage incentives",
  paymentsRecorded: "payments recorded",
  documentsUploaded: "documents uploaded",
  propertyImagesUploaded: "property images uploaded",
  importJobsCreated: "import jobs created",
  importMappingPresetsCreated: "import mapping presets created",
  auditLogs: "audit log entries",
  backupsTriggered: "backups triggered",
  restoreValidationsDone: "restore validations",
  savedViews: "saved views",
  systemConfigsUpdated: "system config updates",
  automationRulesCreated: "automation rules created",
  inventoryPartnersCreated: "inventory partners created",
  propertiesLastVerified: "properties last verified",
  propertiesLocationCaptured: "properties with location captured",
  propertyLocalitiesCreated: "localities created",
  propertyLocalityAliasesCreated: "locality aliases created",
  propertyTimelineEventsActed: "property timeline events",
  availabilityReportsSubmitted: "availability reports submitted",
  availabilityReportsReviewed: "availability reports reviewed",
  propertyReportsSubmitted: "property reports submitted",
  propertyReportsResolved: "property reports resolved",
  visitFeedbackSubmitted: "visit feedback submitted",
  leadPhonesCreated: "lead phones created",
  leadAssignmentHistoryTo: "lead assignment history",
  catalogueExecutiveStatusUpdates: "catalogue status updates",
  catalogueVersionEventsActed: "catalogue version events",
  propertyFavorites: "property favorites",
  propertyViewLogs: "property view logs",
  dealOffers: "deal offers",
  requirementBroadcasts: "requirement broadcasts",
  matchRecommendations: "match recommendations",
  customerContactsCreated: "customer contacts created",
  customerRequirementsCreated: "customer requirements created",
  propertyRecommendationsCreated: "property recommendations created",
  propertyRecommendationsResponded: "property recommendations responded to",
  leadRequirementsCreated: "lead requirements created",
};

/**
 * Permanently deletes an employee. This is deliberately hard to reach:
 *
 *   1. Only an already-INACTIVE (deactivated) employee is eligible - this
 *      forces the two-step "deactivate, then delete" path rather than a
 *      single irreversible click on a still-active account.
 *   2. Every relation that represents real CRM history/ownership must be
 *      empty (see HISTORY_RELATION_LABELS). If anything is attached, the
 *      delete is refused and every non-empty relation is named - this is
 *      the "prefer deactivate over hard-delete when historical records
 *      exist" rule from the spec, enforced rather than merely suggested.
 *   3. Self-delete and deleting the organization's only ADMIN are refused,
 *      same as disableEmployeeAccount - a deleted admin cannot be "re-
 *      enabled" the way a disabled one can.
 *
 * A genuinely blank test account (no leads/properties/visits/etc. ever
 * attached to it) passes straight through; anything else does not.
 */
export async function deleteEmployeeAccount(params: {
  employeeId: string;
  organizationId: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: { id: params.employeeId, organizationId: params.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        _count: { select: Object.fromEntries(Object.keys(HISTORY_RELATION_LABELS).map((k) => [k, true])) as Record<keyof typeof HISTORY_RELATION_LABELS, true> },
      },
    });
    if (!employee) throw new ApiError(404, "Employee not found");

    if (employee.id === params.actorId) {
      throw new ApiError(400, "You cannot delete your own account");
    }
    if (employee.status !== "INACTIVE") {
      throw new ApiError(409, "Deactivate this employee first, then permanently delete the deactivated account");
    }
    if (employee.role === "ADMIN") {
      const otherAdmins = await tx.user.count({
        where: { organizationId: params.organizationId, role: "ADMIN", id: { not: employee.id } },
      });
      if (otherAdmins === 0) {
        throw new ApiError(400, "Cannot delete the only admin in this organization");
      }
    }

    const blockingRelations = Object.entries(employee._count)
      .filter(([, count]) => (count as number) > 0)
      .map(([key, count]) => `${HISTORY_RELATION_LABELS[key]} (${count})`);
    if (blockingRelations.length > 0) {
      throw new ApiError(
        409,
        `Cannot permanently delete ${employee.name}: this account has CRM history attached - ${blockingRelations.join(", ")}. Keep the account deactivated instead.`
      );
    }

    await tx.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.actorId,
        action: "DELETE",
        entityType: "User",
        entityId: employee.id,
        oldValues: JSON.stringify({ name: employee.name, email: employee.email, role: employee.role, status: employee.status }),
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.ACCOUNT_DELETED }),
      },
    });

    // AccountSetupToken/PasswordResetToken cascade-delete with the user
    // (see schema onDelete: Cascade) - nothing else should still reference
    // this id after the blockingRelations check above passed.
    await tx.user.delete({ where: { id: employee.id } });

    return { id: employee.id, deleted: true as const };
  });
}

/**
 * Re-enables an INACTIVE employee into ACTIVE if they have a password they
 * chose themselves, or back into PENDING_SETUP if they never completed setup
 * (the admin then generates a fresh setup link).
 */
export async function enableEmployeeAccount(params: {
  employeeId: string;
  organizationId: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: { id: params.employeeId, organizationId: params.organizationId },
      select: { id: true, status: true },
    });
    if (!employee) throw new ApiError(404, "Employee not found");
    if (employee.status !== "INACTIVE") throw new ApiError(409, "Only a disabled employee can be enabled");

    const status = (await hasCompletedAccountSetup(tx, employee.id)) ? "ACTIVE" : "PENDING_SETUP";
    const enabled = await tx.user.updateMany({
      where: { id: employee.id, organizationId: params.organizationId, status: "INACTIVE" },
      data: { status },
    });
    if (enabled.count !== 1) throw new ApiError(409, "Only a disabled employee can be enabled");

    await tx.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.actorId,
        action: "UPDATE",
        entityType: "User",
        entityId: employee.id,
        oldValues: JSON.stringify({ status: "INACTIVE" }),
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.ACCOUNT_ENABLED, status }),
      },
    });
    return { id: employee.id, status };
  });
}

import { Badge } from "@/components/ui/badge";

const TONE = { ACTIVE: "green", PENDING_SETUP: "amber", INACTIVE: "slate" } as const;
const LABEL = { ACTIVE: "Active", PENDING_SETUP: "Pending Setup", INACTIVE: "Disabled" } as const;

/**
 * Read-only account status badge.
 *
 * This used to be a one-click toggle that PATCHed `status` directly. That
 * path could not revoke the employee's live sessions or kill their
 * outstanding setup/reset links, so a "disabled" employee stayed signed in on
 * whatever device they were already using. Status changes now go through
 * `EmployeeAccountControls` -> POST /api/employees/[id]/account-status, which
 * bumps authVersion and cleans up tokens in one transaction; the badge just
 * reports the current state.
 */
export function StatusToggle({ status }: { status: "PENDING_SETUP" | "ACTIVE" | "INACTIVE" }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}

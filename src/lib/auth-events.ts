/**
 * Canonical audit event names for the authentication / account lifecycle.
 *
 * The AuditAction enum in the schema is deliberately coarse (CREATE, UPDATE,
 * LOGIN, ... , OTHER) and the existing convention - see
 * `activateAccount`/`issueAccountSetupToken` - is to record the specific
 * event as a lower-snake-case `event` key inside `newValues` alongside a
 * coarse action. These constants keep those strings in one place so audit
 * queries and tests can't drift from the writers.
 *
 * Nothing here ever carries a secret: values recorded alongside these events
 * must stay limited to ids, statuses and timestamps. `recordAudit`'s
 * `redact()` is a backstop, not a licence to pass secrets in.
 */
export const AUTH_AUDIT_EVENTS = {
  ACCOUNT_SETUP_COMPLETED: "account_setup_completed",
  LOGIN_SUCCESS: "login_success",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_LINK_GENERATED: "password_reset_link_generated",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  PASSWORD_CHANGED: "password_changed",
  ACCOUNT_DISABLED: "account_disabled",
  ACCOUNT_ENABLED: "account_enabled",
  SETUP_LINK_REGENERATED: "account_setup_link_regenerated",
} as const;

export type AuthAuditEvent = (typeof AUTH_AUDIT_EVENTS)[keyof typeof AUTH_AUDIT_EVENTS];

/**
 * Work factor for every bcrypt hash in the app. Matches the cost already used
 * by account activation and employee creation - changing it here would make
 * newly written hashes disagree with existing ones' cost, which bcrypt itself
 * handles fine (the cost is embedded in the hash) but which should be a
 * deliberate decision rather than an accident of a new code path.
 */
export const BCRYPT_COST = 10;

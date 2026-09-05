/**
 * Handover reset - shared constants.
 *
 * This is the one-time "wipe demo/test operational data, keep schema +
 * infra + one admin" tool described in the handover-reset-tooling task.
 * NOTHING in this module or its siblings ever runs automatically; every
 * script that imports these constants still requires an explicit
 * `--execute` flag AND the exact confirmation string below before a single
 * write happens (see reset.ts / r2-cleanup.ts).
 */

/** The only organization this tool ever touches. Never deleted itself - only its child rows. */
export const HANDOVER_ORGANIZATION_ID = "org_default";

/** The one User row that must survive the reset, unconditionally. */
export const HANDOVER_ADMIN_EMAIL = "founder@kpproperties.co.in";

/**
 * Recorded for humans reading this file only - the actual preflight check
 * in migrations.ts reads the real migration count off disk
 * (prisma/migrations/) at runtime and compares it against what
 * `_prisma_migrations` reports was actually applied. Neither side of that
 * comparison ever trusts this literal; it exists purely as a
 * documentation/sanity cross-check for a reviewer skimming this file.
 */
export const EXPECTED_MIGRATION_COUNT_AT_BUILD_TIME = 32;

/**
 * Must be passed via `--confirm=<value>` (exact match, case-sensitive) in
 * addition to `--execute` before scripts/handover-reset.ts writes anything.
 * Deliberately not a generic "true"/"yes" - names this specific operation so
 * it can never be copy-pasted from an unrelated script by accident.
 */
export const REQUIRED_EXECUTE_CONFIRMATION = "RESET_KP_DEMO_DATA";

/** Same idea as REQUIRED_EXECUTE_CONFIRMATION, but for the fully separate R2 object-cleanup stage. */
export const REQUIRED_R2_EXECUTE_CONFIRMATION = "RESET_KP_DEMO_R2_OBJECTS";

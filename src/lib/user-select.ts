import type { Prisma } from "@prisma/client";

/**
 * Minimal, non-sensitive projection for a related User (e.g. Lead.assignedTo,
 * Activity.actor) when the only thing the UI/response actually needs is who
 * it is. Deliberately excludes `passwordHash` and every other account/auth
 * field - several list endpoints used to `include: { assignedTo: true }` /
 * `include: { actor: true }`, which serialized the full User row (including
 * the bcrypt hash) into API JSON and into the RSC payload sent to the
 * browser for every lead/activity row. Use this instead of a bare `true`
 * whenever only the display name (and occasionally id) is needed.
 */
export const assignedToSelect = {
  id: true,
  name: true,
} satisfies Prisma.UserSelect;

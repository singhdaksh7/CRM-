import { prisma } from "../prisma";
import { DEMO_ORGANIZATION_ID } from "./constants";

/**
 * Read-only on purpose. The Phase 2 spec is explicit: "Never delete
 * existing production data. Only insert demo data. Everything must belong
 * to the current organization." - so unlike an earlier pass of this
 * framework, this does NOT rename the Organization row or touch its
 * settings; it only confirms org_default (the only organization this
 * single-tenant app's getOrganizationId() ever resolves to - see
 * properties.ts / leads.ts doc comments for why demo rows use it directly)
 * actually exists before attaching demo rows to it, and fails loudly if it
 * doesn't rather than silently creating one.
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const existing = await prisma.organization.findUnique({ where: { id: DEMO_ORGANIZATION_ID } });
  if (!existing) {
    throw new Error(
      `Organization "${DEMO_ORGANIZATION_ID}" does not exist. Run migrations first (its baseline migration creates this row) - this script never creates or renames an Organization.`
    );
  }
  return existing.id;
}

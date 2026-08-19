/**
 * The property recommendation link (rule 23) deliberately reuses the
 * existing public property page at src/app/p/[id]/page.tsx rather than
 * building a second DTO/page - that page already implements the exact
 * redaction this feature needs (excludes owner name/phone/notes, exact
 * address, brokerage, internal notes; shows locality, price, BHK/
 * commercial specs, and whatever cover/gallery photos exist). This file is
 * just the URL builder so callers don't hardcode the route.
 */
export function getPublicPropertyRecommendationUrl(propertyId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/p/${propertyId}`;
}

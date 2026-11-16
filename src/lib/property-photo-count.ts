/**
 * Single source of truth for "how many valid photos does this property have".
 *
 * Photos are persisted as PropertyImage rows (status ACTIVE, purpose IMAGE,
 * non-empty storageKey) by the upload pipeline. The legacy Property.images
 * JSON array is only populated by older/seeded data, so it is still counted
 * (non-empty strings only) for backwards compatibility. A cover image is NOT
 * required for a property to "have photos"; cover is tracked separately by
 * hasPropertyCoverImage().
 *
 * Pure (no I/O) so UI, API and scoring code can share it and tests need no DB.
 */

export interface PhotoRowLike {
  status?: string | null;
  purpose?: string | null;
  storageKey?: string | null;
  isCover?: boolean | null;
}

/** Rows that count as a real, persisted gallery photo. */
export function isValidPhotoRow(row: PhotoRowLike | null | undefined): boolean {
  if (!row) return false;
  if (row.status !== "ACTIVE") return false;
  if (row.purpose !== "IMAGE") return false;
  return typeof row.storageKey === "string" && row.storageKey.trim().length > 0;
}

/** Tolerant parse of the legacy Property.images JSON string into non-empty entries. */
export function parseLegacyImages(images: string | null | undefined): string[] {
  if (!images) return [];
  try {
    const parsed: unknown = JSON.parse(images);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

export function countValidPropertyPhotos(input: { photoRows?: readonly PhotoRowLike[] | null; legacyImages?: string | null }): number {
  const rows = (input.photoRows ?? []).filter(isValidPhotoRow).length;
  return rows + parseLegacyImages(input.legacyImages).length;
}

export function hasPropertyPhotos(input: { photoRows?: readonly PhotoRowLike[] | null; legacyImages?: string | null }): boolean {
  return countValidPropertyPhotos(input) > 0;
}

/** Cover is separate from "has photos": explicit cover row, or the legacy coverImage scalar. */
export function hasPropertyCoverImage(input: { photoRows?: readonly PhotoRowLike[] | null; legacyCoverImage?: string | null }): boolean {
  if (typeof input.legacyCoverImage === "string" && input.legacyCoverImage.trim().length > 0) return true;
  return (input.photoRows ?? []).some((r) => isValidPhotoRow(r) && r.isCover === true);
}

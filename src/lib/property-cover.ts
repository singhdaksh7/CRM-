/**
 * Canonical property cover / thumbnail resolution.
 *
 * PropertyImage.isCover (purpose=IMAGE, status=ACTIVE, visibility=PUBLIC) is
 * the single source of truth. Callers must not re-implement cover selection
 * or store duplicate thumbnail URLs on catalogue rows.
 *
 * Private media (PRIVATE visibility, AVAILABILITY_REPORT) is never returned.
 */
export { getCoverImageUrls as resolvePropertyCoverUrls, getCoverImageUrls, getPublicOrderedImageUrls } from "./property-images";

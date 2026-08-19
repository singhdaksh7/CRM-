-- Read-only pre-migration baseline for the Storage + Property Photos + Document
-- Media release. Takes no locks, performs no writes. Run BEFORE
-- 2026-08-19-storage-media.sql and again AFTER/AFTER to prove existing
-- PropertyImage/Document business rows were not silently altered.
--
-- SAFETY: never references a column/table/enum this migration introduces as a
-- bare identifier. New tables/enums are only probed via information_schema /
-- pg_catalog or the dynamic-EXECUTE helper below.

CREATE OR REPLACE FUNCTION pg_temp.__kp_table_count(reg text) RETURNS bigint AS $$
DECLARE
  result bigint;
BEGIN
  IF to_regclass(reg) IS NULL THEN
    RETURN 0;
  END IF;
  EXECUTE format('SELECT count(*) FROM %s', reg) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

WITH media_counts AS (
  SELECT
    (SELECT count(*) FROM "property_images") AS property_images_total,
    (SELECT count(*) FROM "property_images" WHERE status = 'ACTIVE') AS property_images_active,
    (SELECT count(*) FROM "property_images" WHERE "isCover" = true AND status = 'ACTIVE') AS property_images_active_covers,
    (SELECT count(*) FROM "documents") AS documents_total,
    (SELECT count(*) FROM "documents" WHERE status = 'ACTIVE') AS documents_active
), new_schema_presence AS (
  SELECT
    pg_temp.__kp_table_count('public.storage_upload_sessions') AS storage_upload_sessions_count,
    (to_regclass('public.storage_upload_sessions') IS NOT NULL) AS storage_upload_sessions_exist,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'property_images'
        AND column_name IN ('visibility','thumbnailKey','originalFilename')) AS property_image_new_column_count,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'documents' AND column_name = 'isPublic') AS document_is_public_present,
    (SELECT count(*) FROM pg_type WHERE typname IN ('MediaVisibility','StorageUploadStatus')) AS storage_new_enum_type_count,
    (SELECT count(*) FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'DocumentCategory' AND e.enumlabel = 'PROPERTY_BROCHURE') AS brochure_enum_present
), fingerprints AS (
  -- Opaque hashes only - no filenames, object keys, or signed URLs.
  SELECT
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || "propertyId" || '|' || purpose::text || '|' ||
        status::text || '|' || "isCover"::text || '|' || "sortOrder"::text || '|' || "sizeBytes"::text || '|' ||
        "createdAt"::text,
        ',' ORDER BY id))
     FROM "property_images") AS property_image_business_fingerprint,
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || "entityType"::text || '|' || category::text || '|' ||
        status::text || '|' || coalesce("fileSizeBytes"::text, '~') || '|' || "createdAt"::text,
        ',' ORDER BY id))
     FROM "documents") AS document_business_fingerprint
)
SELECT * FROM media_counts, new_schema_presence, fingerprints;

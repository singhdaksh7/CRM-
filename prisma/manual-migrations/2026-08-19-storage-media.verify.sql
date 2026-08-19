-- Read-only verification for storage media migration. Zero writes.
WITH enums AS (
  SELECT
    (SELECT bool_or(e.enumlabel = 'PUBLIC') FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'MediaVisibility') AS media_visibility_ok,
    (SELECT bool_or(e.enumlabel = 'PENDING') FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'StorageUploadStatus') AS upload_status_ok,
    (SELECT bool_or(e.enumlabel = 'PROPERTY_BROCHURE') FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'DocumentCategory') AS brochure_ok
), cols AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'property_images' AND column_name IN ('visibility','thumbnailKey','originalFilename')) = 3 AS property_image_cols_ok,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'isPublic') = 1 AS document_is_public_ok,
    (SELECT count(*) FROM information_schema.tables WHERE table_name = 'storage_upload_sessions') = 1 AS session_table_ok
), indexes AS (
  SELECT
    (SELECT count(*) FROM pg_indexes WHERE indexname = 'property_images_storageKey_key') = 1 AS storage_key_unique_ok,
    (SELECT count(*) FROM pg_indexes WHERE indexname = 'property_images_one_active_cover_per_property') = 1 AS one_cover_ok,
    (SELECT count(*) FROM pg_indexes WHERE indexname = 'storage_upload_sessions_organizationId_objectKey_key') = 1 AS session_unique_ok
)
SELECT
  CASE WHEN enums.media_visibility_ok AND enums.upload_status_ok AND enums.brochure_ok
            AND cols.property_image_cols_ok AND cols.document_is_public_ok AND cols.session_table_ok
            AND indexes.storage_key_unique_ok AND indexes.one_cover_ok AND indexes.session_unique_ok
       THEN 'PASS' ELSE 'FAIL' END AS result,
  enums.*,
  cols.*,
  indexes.*
FROM enums, cols, indexes;

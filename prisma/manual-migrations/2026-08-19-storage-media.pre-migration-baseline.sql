-- Pre-migration baseline (read-only). Capture row counts before applying storage media migration.
SELECT 'property_images' AS entity, count(*) AS row_count FROM "property_images"
UNION ALL
SELECT 'documents', count(*) FROM "documents"
UNION ALL
SELECT 'storage_upload_sessions', coalesce((SELECT count(*) FROM information_schema.tables WHERE table_name = 'storage_upload_sessions'), 0);

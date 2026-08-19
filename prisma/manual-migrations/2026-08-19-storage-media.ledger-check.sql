-- Ledger check: existing media rows must still exist after migration (no silent deletes).
-- Compare against counts captured in the pre-migration baseline.
SELECT
  (SELECT count(*) FROM "property_images") AS property_images_count,
  (SELECT count(*) FROM "documents") AS documents_count,
  (SELECT count(*) FROM "storage_upload_sessions") AS upload_sessions_count,
  (SELECT count(*) FROM "property_images" WHERE "isCover" = true AND "status" = 'ACTIVE') AS active_covers,
  (SELECT count(*) FROM (
      SELECT "propertyId" FROM "property_images"
      WHERE "isCover" = true AND "status" = 'ACTIVE'
      GROUP BY "propertyId" HAVING count(*) > 1
  ) d) AS properties_with_multiple_covers;

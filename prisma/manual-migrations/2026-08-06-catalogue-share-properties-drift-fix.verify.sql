-- Verification for 2026-08-06-catalogue-share-properties-drift-fix.sql
-- Read-only. Run after applying the migration above.
--
-- Expected result: exactly 4 rows, matching the definitions below.
--   internalNote   | text    | YES | (null)
--   isTopPick      | boolean | NO  | false
--   addedManually  | boolean | NO  | false
--   addedByUserId  | text    | YES | (null)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'catalogue_share_properties'
  AND column_name IN ('internalNote', 'isTopPick', 'addedManually', 'addedByUserId')
ORDER BY column_name;

-- Expected result: 1 row (the foreign key exists and points at users.id).
SELECT conname, confrelid::regclass AS references_table
FROM pg_constraint
WHERE conname = 'catalogue_share_properties_addedByUserId_fkey';

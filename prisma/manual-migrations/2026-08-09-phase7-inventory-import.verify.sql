-- Read-only Phase 7 schema verification. Returns no rows when anything is missing.
WITH required_enums(type_name, value) AS (VALUES
 ('InventoryImportMode','CREATE_ONLY'),('InventoryImportMode','UPSERT_SAFE'),('InventoryImportMode','UPDATE_EXISTING_ONLY'),
 ('ImportPartialPolicy','REQUIRE_ALL_ROWS_VALID'),('ImportPartialPolicy','IMPORT_VALID_ROWS'),
 ('PropertyDuplicateClass','EXACT_DUPLICATE'),('PropertyDuplicateClass','PROBABLE_DUPLICATE'),('PropertyDuplicateClass','POSSIBLE_DUPLICATE'),('PropertyDuplicateClass','NEW'),
 ('PropertyImportAction','CREATE'),('PropertyImportAction','UPDATE_EXISTING'),('PropertyImportAction','SKIP'),
 ('ImportStatus','DRAFT'),('ImportStatus','RUNNING'),('ImportStatus','COMPLETED_WITH_ERRORS'),
 ('ImportRecordStatus','WARNING'),('ImportRecordStatus','FAILED')
), actual_enums AS (
 SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
), required_columns(table_name,column_name) AS (VALUES
 ('import_jobs','sheetName'),('import_jobs','importMode'),('import_jobs','partialPolicy'),('import_jobs','allowBlankClear'),('import_jobs','fileHash'),
 ('import_jobs','warningRows'),('import_jobs','errorRows'),('import_jobs','createdRows'),('import_jobs','updatedRows'),
 ('import_jobs','skippedRows'),('import_jobs','failedRows'),('import_jobs','rolledBackAt'),('import_records','action'),('import_records','duplicateClass'),
 ('import_records','validationErrors'),('import_records','warnings'),('import_records','beforeSummary'),('import_records','afterSummary'),
 ('import_mapping_presets','id'),('import_mapping_presets','organizationId'),('import_mapping_presets','name'),('import_mapping_presets','entityType'),
 ('import_mapping_presets','headerSignature'),('import_mapping_presets','columnMapping'),('import_mapping_presets','createdById'),('import_mapping_presets','createdAt'),('import_mapping_presets','updatedAt'),
 ('properties','dimension'),('properties','possessionNotes'),('properties','liftAvailable')
), missing AS (
 SELECT 'enum' kind, type_name object_name, value detail FROM required_enums r
 WHERE NOT EXISTS (SELECT 1 FROM actual_enums a WHERE a.typname=r.type_name AND a.enumlabel=r.value)
 UNION ALL
 SELECT 'column', table_name, column_name FROM required_columns r WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name)
 UNION ALL SELECT 'table','import_mapping_presets','missing' WHERE to_regclass('public.import_mapping_presets') IS NULL
 UNION ALL SELECT 'constraint','import_mapping_presets_organizationId_name_key','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='import_mapping_presets_organizationId_name_key')
 UNION ALL SELECT 'index','import_mapping_presets_organizationId_entityType_idx','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='import_mapping_presets_organizationId_entityType_idx')
 UNION ALL SELECT 'index','import_mapping_presets_organizationId_headerSignature_idx','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='import_mapping_presets_organizationId_headerSignature_idx')
 UNION ALL SELECT 'index','import_jobs_organizationId_createdAt_idx','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='import_jobs_organizationId_createdAt_idx')
 UNION ALL SELECT 'index','import_jobs_organizationId_status_idx','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='import_jobs_organizationId_status_idx')
 UNION ALL SELECT 'fk','import_mapping_presets_organizationId_fkey','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_mapping_presets_organizationId_fkey')
 UNION ALL SELECT 'fk','import_mapping_presets_createdById_fkey','missing' WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_mapping_presets_createdById_fkey')
)
SELECT * FROM missing ORDER BY kind, object_name, detail;

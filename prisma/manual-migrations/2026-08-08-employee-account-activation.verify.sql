-- Read-only verification. One result row; PASS means the activation schema is exact.
WITH enum_check AS (
  SELECT count(*) = 1 AS ok FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
  JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname=current_schema() AND t.typname='EmployeeStatus' AND e.enumlabel='PENDING_SETUP'
), columns_expected(name, data_type, nullable, expected_default) AS (
  VALUES ('id','text','NO',NULL), ('organizationId','text','NO',NULL), ('userId','text','NO',NULL),
    ('tokenHash','text','NO',NULL), ('expiresAt','timestamp without time zone','NO',NULL),
    ('usedAt','timestamp without time zone','YES',NULL), ('createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP')
), column_check AS (
  SELECT count(*)=7 AND bool_and(c.data_type=e.data_type AND c.is_nullable=e.nullable AND
    (e.expected_default IS NULL OR c.column_default ILIKE '%'||e.expected_default||'%')) AS ok
  FROM columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema=current_schema() AND c.table_name='account_setup_tokens' AND c.column_name=e.name
), constraint_check AS (
  SELECT count(*) FILTER (WHERE constraint_name='account_setup_tokens_pkey' AND constraint_type='PRIMARY KEY')=1 AS ok
  FROM information_schema.table_constraints WHERE constraint_schema=current_schema() AND table_name='account_setup_tokens'
), index_check AS (
  SELECT count(*) FILTER (WHERE indexname IN ('account_setup_tokens_tokenHash_key','account_setup_tokens_organizationId_userId_idx','account_setup_tokens_expiresAt_idx'))=3 AS ok
  FROM pg_indexes WHERE schemaname=current_schema() AND tablename='account_setup_tokens'
), fk_check AS (
  SELECT count(*)=2 AND bool_and(delete_rule='CASCADE' AND update_rule='CASCADE') AS ok
  FROM information_schema.referential_constraints WHERE constraint_schema=current_schema()
    AND constraint_name IN ('account_setup_tokens_organizationId_fkey','account_setup_tokens_userId_fkey')
)
SELECT CASE WHEN enum_check.ok AND column_check.ok AND constraint_check.ok AND index_check.ok AND fk_check.ok THEN 'PASS' ELSE 'FAIL' END AS result,
  enum_check.ok AS pending_setup_enum, column_check.ok AS columns, constraint_check.ok AS primary_key,
  index_check.ok AS indexes, fk_check.ok AS foreign_keys
FROM enum_check, column_check, constraint_check, index_check, fk_check;

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
  SELECT count(c.column_name)=7 AND bool_and(coalesce(c.data_type=e.data_type AND c.is_nullable=e.nullable AND
    (e.expected_default IS NULL OR c.column_default ILIKE '%'||e.expected_default||'%'), false)) AS ok
  FROM columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema=current_schema() AND c.table_name='account_setup_tokens' AND c.column_name=e.name
), constraint_check AS (
  SELECT count(*) FILTER (WHERE constraint_name='account_setup_tokens_pkey' AND constraint_type='PRIMARY KEY')=1 AS ok
  FROM information_schema.table_constraints WHERE constraint_schema=current_schema() AND table_name='account_setup_tokens'
), index_check AS (
  SELECT count(*) FILTER (WHERE indexname='account_setup_tokens_tokenHash_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%(%"tokenHash"%)')=1
    AND count(*) FILTER (WHERE indexname='account_setup_tokens_organizationId_userId_idx' AND indexdef ILIKE '%(%"organizationId", "userId"%)')=1
    AND count(*) FILTER (WHERE indexname='account_setup_tokens_expiresAt_idx' AND indexdef ILIKE '%(%"expiresAt"%)')=1 AS ok
  FROM pg_indexes WHERE schemaname=current_schema() AND tablename='account_setup_tokens'
), fk_check AS (
  SELECT count(*)=2 AND bool_and(delete_rule='CASCADE' AND update_rule='CASCADE'
    AND ((constraint_name='account_setup_tokens_organizationId_fkey' AND source_column='organizationId' AND target_table='organizations' AND target_column='id')
      OR (constraint_name='account_setup_tokens_userId_fkey' AND source_column='userId' AND target_table='users' AND target_column='id'))) AS ok
  FROM (
    SELECT rc.constraint_name, rc.delete_rule, rc.update_rule, kcu.column_name AS source_column,
      ccu.table_name AS target_table, ccu.column_name AS target_column
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_schema=rc.constraint_schema AND kcu.constraint_name=rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_schema=rc.constraint_schema AND ccu.constraint_name=rc.constraint_name
    WHERE rc.constraint_schema=current_schema()
      AND rc.constraint_name IN ('account_setup_tokens_organizationId_fkey','account_setup_tokens_userId_fkey')
  ) expected_fks
)
SELECT CASE WHEN enum_check.ok AND column_check.ok AND constraint_check.ok AND index_check.ok AND fk_check.ok THEN 'PASS' ELSE 'FAIL' END AS result,
  enum_check.ok AS pending_setup_enum, column_check.ok AS columns, constraint_check.ok AS primary_key,
  index_check.ok AS indexes, fk_check.ok AS foreign_keys
FROM enum_check, column_check, constraint_check, index_check, fk_check;

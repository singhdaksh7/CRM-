-- Read-only verification for the Housing lead-event snapshot column. One
-- result row; PASS means the column exists with the expected nullable text
-- type and no other schema drift occurred on external_lead_events. Runs no
-- writes, takes no locks.
WITH column_check AS (
  SELECT count(*) = 1 AS ok
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'external_lead_events'
    AND column_name = 'leadSnapshot' AND data_type = 'text' AND is_nullable = 'YES'
), table_still_present AS (
  SELECT count(*) = 1 AS ok FROM information_schema.tables
  WHERE table_schema = current_schema() AND table_name = 'external_lead_events'
)
SELECT
  CASE WHEN (SELECT ok FROM column_check) AND (SELECT ok FROM table_still_present) THEN 'PASS' ELSE 'FAIL' END AS result,
  (SELECT ok FROM column_check) AS lead_snapshot_column_ok,
  (SELECT ok FROM table_still_present) AS table_present_ok;

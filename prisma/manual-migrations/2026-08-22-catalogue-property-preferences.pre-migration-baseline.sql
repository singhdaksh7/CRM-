-- Read-only pre-migration baseline for CataloguePropertyPreference.
-- Never references new columns/tables as bare identifiers (parse-time safety).

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

WITH lead_counts AS (
  SELECT count(*) AS total_leads FROM "leads"
), property_counts AS (
  SELECT count(*) AS total_properties FROM "properties"
), related_counts AS (
  SELECT
    (SELECT count(*) FROM "catalogue_shares") AS catalogues,
    (SELECT count(*) FROM "catalogue_interactions") AS interactions,
    (SELECT count(*) FROM "visits") AS visits
), pref_counts AS (
  SELECT pg_temp.__kp_table_count('public.catalogue_property_preferences') AS preference_count
), enum_exists AS (
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CataloguePropertyPreferenceStatus') AS preference_enum_exists
)
SELECT
  lead_counts.total_leads,
  property_counts.total_properties,
  related_counts.catalogues,
  related_counts.interactions,
  related_counts.visits,
  pref_counts.preference_count,
  enum_exists.preference_enum_exists
FROM lead_counts, property_counts, related_counts, pref_counts, enum_exists;

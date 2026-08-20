-- Additive only (index creations - no table/column changes, no data
-- migration). Generated offline via
--   prisma migrate diff --from-schema-datamodel <pre-audit schema> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- rather than `prisma migrate dev`, and NOT applied to any database (dev,
-- staging, or production) - see the org-isolation security audit report
-- for full context. For human review before deploying. Consider
-- `CREATE INDEX CONCURRENTLY` instead of a plain CREATE INDEX if these
-- tables are large in production at apply time, since a plain CREATE INDEX
-- takes a write lock on the table for the duration of the build.
--
-- Every index below exists to serve a query that GAINED an organizationId
-- predicate as part of the org-isolation security audit - these queries
-- were previously missing that predicate entirely (the actual
-- vulnerability being fixed), not just running unindexed. Adding the
-- correct organizationId-prefixed composite index alongside the isolation
-- fix keeps the fix from being a performance regression.
--
-- notifications_organizationId_createdAt_idx: searchNotifications()
-- (src/lib/search/entity-search.ts) - no existing index covered
-- organizationId on this table at all.
--
-- properties_organizationId_createdAt_idx: GET /api/properties and the
-- /properties list page's default newest-first sort.
--
-- properties_organizationId_area_idx / properties_organizationId_bhk_idx:
-- dashboard-data.ts's propertiesByLocation groupBy(area), and
-- locality-analytics-data.ts's propertiesByArea/propertiesByBhk
-- groupBy(area)/groupBy(bhk).
--
-- leads_organizationId_createdAt_idx: dashboard-data.ts's newLeadsToday
-- count (organizationId + createdAt range).
--
-- leads_organizationId_status_updatedAt_idx: dashboard-data.ts's
-- dealsClosedThisMonth count (organizationId + status=CLOSED_WON +
-- updatedAt range).
--
-- leads_organizationId_source_idx: dashboard-data.ts's leadsBySource
-- groupBy query. leadsByStatus's groupBy(organizationId, status)
-- deliberately has NO separate index of its own here -
-- leads_organizationId_status_updatedAt_idx below already covers any
-- query filtering/grouping on just the (organizationId, status) prefix,
-- so a narrower [organizationId, status] index would be pure write
-- amplification with no read benefit.
--
-- NOTE on the sibling feature/performance-optimization branch: that branch
-- independently added properties_createdAt_idx, leads_createdAt_idx,
-- leads_assignedToId_idx, and leads_status_updatedAt_idx (all WITHOUT an
-- organizationId prefix, deliberately matching the pre-audit unscoped
-- query shapes). Once both branches are merged, leads_createdAt_idx and
-- properties_createdAt_idx become redundant with the organizationId-
-- prefixed indexes below for the now-scoped queries (Postgres can use
-- either the plain or the prefixed index for an organizationId-filtered
-- query via the prefixed one alone; a caller that still needs an
-- all-orgs newest-first scan, if one legitimately exists, keeps needing
-- the plain index). leads_assignedToId_idx becomes fully redundant with
-- the already-existing leads_organizationId_assignedToId_idx now that
-- unassignedLeads carries organizationId. leads_status_updatedAt_idx is
-- superseded by leads_organizationId_status_updatedAt_idx below for the
-- dealsClosedThisMonth query specifically. See the audit report's
-- "Compatibility with performance branch" section for the full reasoning
-- and recommended cleanup.

-- CreateIndex
CREATE INDEX "notifications_organizationId_createdAt_idx" ON "notifications"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "properties_organizationId_createdAt_idx" ON "properties"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "properties_organizationId_area_idx" ON "properties"("organizationId", "area");

-- CreateIndex
CREATE INDEX "properties_organizationId_bhk_idx" ON "properties"("organizationId", "bhk");

-- CreateIndex
CREATE INDEX "leads_organizationId_createdAt_idx" ON "leads"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_status_updatedAt_idx" ON "leads"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_source_idx" ON "leads"("organizationId", "source");

-- CreateIndex
CREATE INDEX "activities_organizationId_createdAt_idx" ON "activities"("organizationId", "createdAt");

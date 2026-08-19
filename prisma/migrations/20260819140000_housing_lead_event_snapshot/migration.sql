-- Additive only. Adds a safe, staff-facing summary column to
-- external_lead_events so the Portal Leads review UI can show contact and
-- requirement context (name, phone, email, project, locality, budget, area)
-- for an event even when it has not (or never will be) linked to a Lead -
-- e.g. an AMBIGUOUS Housing enquiry awaiting manual review. This is never
-- the full raw provider payload - only rawPayloadHash (already existing)
-- represents the raw delivery, and that stays a one-way hash.
ALTER TABLE "external_lead_events" ADD COLUMN "leadSnapshot" TEXT;

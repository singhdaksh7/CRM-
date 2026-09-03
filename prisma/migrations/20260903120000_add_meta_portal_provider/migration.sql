-- Forward-only: introduces Meta as an explicit source/provider. No rows are altered or removed.
ALTER TYPE "PropertyPortalProvider" ADD VALUE IF NOT EXISTS 'META';
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'META';

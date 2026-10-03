# 99acres inbound lead webhook

99acres has **not** supplied API documentation. They asked for an endpoint they can POST lead data to. This endpoint is therefore built to capture an unknown payload safely, keep the original, and map what it recognises into the CRM.

```
POST https://crm.kpproperties.co.in/api/integrations/99acres/leads
Authorization: Bearer <ACRES_99_WEBHOOK_SECRET>
Content-Type: application/json            (or application/x-www-form-urlencoded)
```

Code: `src/app/api/integrations/99acres/leads/route.ts` (transport), `src/integrations/ninety-nine-acres/` (config/auth, payload parsing + sanitising, adapter). Persistence reuses `ingestPortalLead` / `ExternalLeadEvent` from `src/integrations/property-portals/ingestion.ts` - the same path as Housing.

## Pipeline

`HTTPS + per-IP rate limit -> bearer auth -> 64 KB capped body parse -> sanitised raw capture -> 99acres adapter -> shared portal ingestion -> internal CRM workflows`

* **Auth** - constant-time bearer comparison. Missing/non-Bearer -> `401`; wrong secret -> `403`; secret not configured -> `503` (never open). Rate limiting runs *before* auth, so it also bounds guessing.
* **Tenant** - `ACRES_99_ORGANIZATION_ID` (default `org_default`, KP Properties). Nothing in a payload can select an organization.
* **Raw capture** - the sanitised payload is stored under `rawPayload` in `ExternalLeadEvent.leadSnapshot`, next to a mapped summary, the list of unrecognised top-level fields (`unmappedFields`) and review reasons. Credential-like keys (`authorization`, `token`, `secret`, `password`, `api_key`, `cookie`, ...) and any value containing the webhook secret are redacted; request headers are never stored. The same record is visible in **Leads -> Portal leads**.
* **Adapter** - recognises common aliases (not claimed to be official), case-insensitively and ignoring punctuation (`Lead_Name` = `leadName`), including inside nested objects. To fix a mapping after the first real request, edit `ALIASES` in `adapter.ts`; the stored raw payloads show exactly what to add.

## Minimum creation rule

A **valid Indian mobile number** is the only hard requirement. Name (`99acres Enquiry`), locality (`Not specified`) and budget (`0`) have placeholders and the event is flagged `needsReview` with reasons. Without a usable phone no Lead is created: the event is stored as `NEEDS_REVIEW` and the response is `received`.

## Idempotency

* `leadId` / `enquiryId` / `externalLeadId` (and similar) -> event id `99acres:<id>`; the Lead's `externalLeadId` is namespaced the same way.
* No id -> fingerprint of normalised phone/email + listing (or project) + timestamp + message.
* Replays return `duplicate`; concurrent retries that race on the unique key also return `duplicate`.
* A phone/email that already belongs to exactly one Lead returns `duplicate` (no second Lead). If it matches several Leads the event is kept for staff (`received`, status `AMBIGUOUS`).

## Responses

| Outcome | HTTP | Body |
| --- | --- | --- |
| New lead | 200 | `{"success":true,"status":"created"}` |
| Replay / already a lead | 200 | `{"success":true,"status":"duplicate"}` |
| Stored, needs mapping/review | 200 | `{"success":true,"status":"received"}` |
| Missing / wrong credentials | 401 / 403 | `{"success":false,"error":"unauthorized" \| "forbidden"}` |
| Bad JSON / not an object | 400 | `{"success":false,"error":"invalid_payload"}` |
| Unsupported content type | 415 | `{"success":false,"error":"unsupported_media_type"}` |
| Body > 64 KB | 413 | `{"success":false,"error":"payload_too_large"}` |
| Rate limited | 429 | `Retry-After` header |
| Our failure (safe to retry) | 500 | `{"success":false,"error":"internal_error"}` |

No internal ids, stack traces or implementation detail are ever returned.

## Commercial / residential mapping

The adapter writes the same canonical `Lead` fields the rest of the CRM matches on: `assetClass`, `transactionType`, `commercialPropertyType` (`SHOP`, `OFFICE`, `SHOWROOM`, `WAREHOUSE`, `INDUSTRIAL`, `COMMERCIAL_LAND`, `CO_WORKING`, `RESTAURANT_SPACE`, `SCO`, `OTHER_COMMERCIAL`), `preferredBhk` (residential only), budget and area. It deliberately does **not** auto-create a `LeadRequirement`: an ACTIVE requirement overrides the Lead's own fields in matching, and a requirement without resolved localities would match too broadly. Staff create requirements in the CRM as for any lead.

## Side effects

Creates the lead, auto-assigns it, scores it, runs property matching and `LEAD_CREATED` automation rules (which only assign / create follow-ups / notify staff), writes audit entries and notifies admins/data managers. It **never** sends WhatsApp or contacts the customer.

## Operations

* `ACRES_99_WEBHOOK_SECRET` lives only in the server's `env/.env.production` (`deploy/scripts/02-gen-env.sh` generates one on a fresh install). Rotate by editing the file and restarting the app; tell 99acres the new value.
* The old mock route `/api/integrations/leads/99acres` (which was open when its key was unset) has been removed; this is the only 99acres ingestion endpoint.

# Property portal integrations

## Architecture

`Provider -> adapter -> normalized lead -> idempotency -> listing mapping -> ExternalLeadEvent -> CRM Lead -> assignment`.

All adapters are server-only. They must use an official, authorized provider contract and must never scrape, automate a browser, or call undocumented endpoints. A provider with no verified contract remains **AWAITING_PROVIDER_ACCESS**.

## Normalized lead

`CanonicalPortalLead` holds provider IDs, event/lead/listing IDs, contact details, message, enquiry type, received time, safe source metadata, and normalized requirement fields. Raw payloads are hashed; only bounded safe snapshots are retained for staff review.

## Idempotency and tenancy

Events are unique per organization and provider. Connection-backed events namespace provider event IDs by connection; legacy Housing IDs retain their existing representation. Fallback delivery deduplication uses a SHA-256 payload fingerprint. Incoming payloads never select an organization.

## Listing mapping

An incoming external listing is resolved within the organization, provider, and (when known) connection. Exactly one result is linked to `PortalListing`; unknown and ambiguous listings retain the lead event without silently attaching a CRM Property.

## Email ingestion

The framework accepts only messages obtained from an approved mailbox mechanism. Sender/domain rules are configured server-side; an email that merely claims to be from a portal is rejected. Housing, OLX, MagicBricks, and 99acres parsers are **AWAITING_SAMPLE** until sanitized, provider-approved sample messages are supplied. Email idempotency uses the mailbox's stable message ID.

## Provider matrix

| Provider | Webhook | Pull | Email | Listing API | Adapter | Production status |
| --- | --- | --- | --- | --- | --- | --- |
| Housing | Supported inbound | Unknown | Awaiting sample | Unknown | Existing normalizer | Connected webhook |
| OLX | Unknown | Unknown | Awaiting sample | Unknown | CRM-ready skeleton | Awaiting provider access |
| MagicBricks | Unknown | Unknown | Awaiting sample | Unknown | CRM-ready skeleton | Awaiting provider access |
| 99acres | Unknown | Unknown | Awaiting sample | Unknown | CRM-ready skeleton | Awaiting provider access |
| Meta | Unknown | Unknown | Unknown | Unknown | CRM-ready skeleton | Awaiting provider access |

## Adding a provider

Register the provider, add evidence-based capabilities, implement only documented adapter operations, configure credentials in approved server-side secret storage, map fields to `CanonicalPortalLead`, and add fixtures/tests. No core lead-pipeline changes should be necessary.

## Access checklist

For OLX, MagicBricks, and 99acres: official documentation, account/dealer identifier, authentication method, credentials, webhook or pull contract, listing/event identifiers, sandbox availability, and rate limits. For Meta: official Lead Ads app/webhook configuration and approved credentials. For email: sanitized message samples plus configured sender/domain rules.

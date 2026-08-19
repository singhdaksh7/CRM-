# Housing.com Lead Webhook - Integration Reference

This document describes the inbound lead-push webhook Housing.com uses to
deliver leads to the CRM. Housing calls this endpoint; the CRM never calls
Housing.

- **CRM Name:** KP Properties CRM
- **Method:** POST
- **Endpoint:** `https://crm.kpproperties.co.in/api/integrations/housing/leads`
- **Content-Type:** `application/json`
- **Success:** `RECEIVED`
- **Invalid:** `BAD REQUEST`
- **Authentication:** No Authentication (by default)

## Endpoint

```
POST https://crm.kpproperties.co.in/api/integrations/housing/leads
```

- **Method:** POST only. Any other method is rejected.
- **Content-Type:** `application/json` only.
- **Max body size:** 256 KB.
- **Authentication:** none required by default, matching Housing's documented
  sample payload (it carries no signature or token). If asked to add a
  shared secret in the future, Housing would send it as the
  `x-housing-webhook-secret` request header; until that header is
  configured on the CRM side, the endpoint accepts unauthenticated requests.

## Request body

```json
{
  "lead_date": 1692858120,
  "apartment_names": "3 BHK",
  "country_code": "+91",
  "service_type": "new-projects",
  "category_type": "residential",
  "locality_name": "Khyora",
  "city_name": "Kanpur",
  "lead_name": "Manish",
  "lead_email": "example@gmail.com",
  "lead_phone": "9415516905",
  "project_id": 265012,
  "project_name": "The Peak",
  "property_field": ["Apartment"],
  "max_area": null,
  "min_area": null,
  "min_price": 8298450,
  "max_price": 9315000
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `lead_date` | number (epoch seconds) | yes | Must be a plausible timestamp (not before 2000-01-01, not more than 1 day in the future). |
| `apartment_names` | string | yes | e.g. `"3 BHK"`. |
| `country_code` | string | yes | Dialing code, e.g. `"+91"`. |
| `service_type` | string | yes | e.g. `"new-projects"`, `"resale"`, or a rental service type. |
| `category_type` | string | yes | e.g. `"residential"` or `"commercial"`. |
| `locality_name` | string | yes | |
| `city_name` | string | yes | |
| `lead_name` | string | yes | |
| `lead_email` | string or `null` | no | |
| `lead_phone` | string | yes | Must be a plausible phone number for `country_code`. |
| `project_id` | number or string | yes | |
| `project_name` | string | yes | |
| `property_field` | array of strings | yes | e.g. `["Apartment"]`. |
| `max_area` | number or `null` | no | |
| `min_area` | number or `null` | no | |
| `min_price` | number | yes | |
| `max_price` | number | yes | Must not be less than `min_price`. |

## Responses

| Situation | Status | Body (exact text) |
|---|---|---|
| Payload accepted (new, matched, or duplicate delivery) | 200 | `RECEIVED` |
| Malformed/invalid payload, wrong content type, or oversized body | 400 or 413 | `BAD REQUEST` |
| Too many requests | 429 | (not contractual text; standard rate-limit response) |
| Unexpected internal failure while processing an otherwise-valid payload | 500 | `ERROR` (please retry) |

The response body never contains any CRM/internal identifier, database field
name, or stack trace - only the exact acknowledgement text above.

## Duplicate deliveries

A repeated delivery of the same lead (e.g. Housing's own retry behavior)
returns `200 RECEIVED` without creating a duplicate record in the CRM. No
special handling is required on Housing's side - simple retry-on-timeout is
safe.

# WhatsApp Cloud API Setup & Production Hardening

This document covers the real Meta WhatsApp Business Cloud API integration: what is implemented, how it behaves in each provider mode, and the exact steps required to activate it against a real Meta account. **Production currently runs `WHATSAPP_PROVIDER=MOCK`** — no Meta credentials are configured, and this document does not claim otherwise.

See also: `ENVIRONMENT.md` ("WhatsApp" section) for the full environment variable reference, and `SECURITY.md` ("File storage" is unrelated — WhatsApp security notes are inline there too).

---

## 1. Provider architecture (unchanged, hardened)

`src/integrations/whatsapp/` implements one provider-agnostic interface (`WhatsAppProviderClient`) with three implementations, selected once via `WHATSAPP_PROVIDER`:

| Provider | Real network calls | Delivery/read status | Use |
|---|---|---|---|
| `MOCK` (default) | None | Simulated via explicit demo controls | Local dev / demos |
| `CLICK_TO_CHAT` | None (opens `wa.me` links) | Never shown (there is no way to know) | Manual sending without an API account |
| `META_CLOUD` | Real Graph API calls | Real, via webhook | Production |

Every call site (`whatsapp-messages.ts`, the Conversation UI, the webhook route) goes through this interface — nothing is provider-specific outside `src/integrations/whatsapp/`.

## 2. What changed in this hardening pass

- **Configurable default country code** (`WHATSAPP_DEFAULT_COUNTRY_CODE`, default `91`) instead of a hardcoded prefix in `phone.ts`.
- **Customer-care window enforcement** (`whatsapp-window.ts`): a session (free-text) message to a META_CLOUD conversation is blocked unless the client messaged within the last 24 hours; an approved template is required outside that window. Mock/Click-to-Chat are exempt (there is no Meta session to be inside or outside of).
- **Template approval registry** (`whatsapp-templates.ts`): six use cases (visit confirmation/reminder, follow-up reminder, catalogue shared, price updated, visit rescheduled) with a name, language, category, and variable list. A template only sends if its exact Meta name is listed in `WHATSAPP_APPROVED_TEMPLATE_NAMES` — nothing is assumed approved by default, and there is no silent fallback to free text.
- **Signature verification now fails closed**: if `WHATSAPP_APP_SECRET` is missing, every webhook is rejected (previously it was accepted unsigned).
- **One bounded retry** for transient Meta failures (HTTP 5xx / 429 / timeout) — never for 4xx validation errors.
- **Correlation ID** (`biz_opaque_callback_data`) attached to every outbound Meta send for log correlation.
- **`markAsRead`** and **`getDiagnostics`** added to the provider interface (health checks without sending a message).
- **Button/interactive replies and unsupported media** are now parsed into safe placeholder text (`[Button reply: ...]`, `[Unsupported message: image]`) instead of being silently dropped.
- **Status regression protection**: a webhook status update can only move a message forward (`QUEUED → SENT → DELIVERED → READ`); a stale/out-of-order event is detected and ignored.
- **Lead resolution no longer guesses**: an inbound message from a phone number matching zero or more than one lead's conversation is flagged and Admin/Data Manager are notified, instead of silently attaching to "the most recent" conversation.
- **Audit logging** (`recordAudit`) added to every send, retry, webhook-signature-rejection, unknown-contact, and multiple-match event.
- **Dedicated rate limits** for manual sends, retries, the test-connection check, and the test-send action (the existing webhook rate limit is untouched — Meta's own redelivery traffic must never be dropped).
- **`WHATSAPP_WEBHOOK_ENABLED`** escape hatch to take the webhook offline (503) mid-setup, even while `META_CLOUD` is selected.

## 3. Meta dashboard setup (do this when ready to go live)

None of this has been done yet — no Meta account or credentials exist for this deployment.

1. Create or use an existing Meta Business (Business Manager) account.
2. Create a Meta developer app at [developers.facebook.com](https://developers.facebook.com) (type: Business).
3. Add the **WhatsApp** product to the app.
4. Meta provides a free temporary test phone number for development — use it first.
5. In the WhatsApp product's API Setup page, add a **test recipient** phone number (your own number) and verify it via the OTP Meta sends.
6. Copy the **Phone Number ID** shown on that page → `WHATSAPP_PHONE_NUMBER_ID`.
7. Copy the **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`.
8. Generate a **permanent token**: System Users (Business Settings → Users → System Users) → create a system user → assign the WhatsApp app → generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions → copy it → `WHATSAPP_ACCESS_TOKEN`. (The short-lived token shown on the API Setup page expires in 24h — do not use it for production.)
9. Configure the webhook: in the app's WhatsApp → Configuration page, set **Callback URL** to `https://crm-kappa-five-28.vercel.app/api/integrations/whatsapp/webhook` and **Verify Token** to a value you choose → also set that same value as `WHATSAPP_VERIFY_TOKEN`.
10. Click **Verify and Save** — Meta calls the GET endpoint with `hub.mode=subscribe`; this only succeeds once `WHATSAPP_VERIFY_TOKEN` is set in the deployed environment and the deploy is live.
11. **Subscribe to webhook fields**: at minimum `messages` (for inbound text/button/interactive replies and delivery/read/failed status updates).
12. Copy the app's **App Secret** (App Settings → Basic) → `WHATSAPP_APP_SECRET`. This is what signs every webhook — required for signature verification to work at all.
13. Create message templates in Business Manager → WhatsApp Manager → Message Templates for each real use case you need (see the six use cases in `whatsapp-templates.ts`) — name, language, category, and body variables must match what's registered in the app's registry (or set `WHATSAPP_TEMPLATE_NAME_<USE_CASE>` to override the name).
14. **Submit each template for Meta's review.** Approval typically takes minutes to a day. Do not mark anything approved in `WHATSAPP_APPROVED_TEMPLATE_NAMES` until Meta Business Manager actually shows **Approved** next to it.
15. Add all variables to Vercel (Production environment; Preview only if a separate test number/app exists) — see the exact list in section 4 below. Never as `NEXT_PUBLIC_*`.
16. Redeploy.
17. Run one real test message via Settings → WhatsApp Integration Engine → **Send Test Message** (requires `WHATSAPP_TEST_RECIPIENT` to be set to your verified test number first).
18. Test an inbound reply: reply to that test message from your phone: confirm it appears in the lead's conversation (only if that phone number matches an existing lead's conversation — otherwise it correctly shows up as an "unknown contact" notification instead, per section 2 above).
19. Confirm delivered/read status updates arrive via the webhook and update the message's status icon in the Conversation UI.
20. Review Vercel runtime logs and the audit log (`AuditLog` table / `recordAudit` calls) — confirm no access token, app secret, verify token, or signed URL ever appears in a log line.

Do not share these credentials over chat/email; do not commit them anywhere in this repository.

## 4. Vercel environment variables (production activation)

```env
WHATSAPP_PROVIDER=META_CLOUD
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_API_VERSION=v20.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91
```

Optional:

```env
WHATSAPP_TEST_RECIPIENT=
WHATSAPP_WEBHOOK_ENABLED=true
WHATSAPP_APPROVED_TEMPLATE_NAMES=
```

Keep secrets in Vercel only. Redeploy after saving.

## 5. Rollback

If anything goes wrong after switching to `META_CLOUD`, set `WHATSAPP_PROVIDER=MOCK` (or `CLICK_TO_CHAT`) in Vercel and redeploy — every route already falls back cleanly (the webhook route itself returns 400 for a non-META_CLOUD provider, and the Settings page shows "Not configured" rather than crashing). No data is lost: existing `WhatsAppMessage`/`WhatsAppConversation` rows are untouched by a provider switch.

## 6. Known limitations (as of this pass)

- Nothing here has been exercised against a live Meta account — no message has actually been sent, received, delivered, or read through the real Cloud API. This document does not claim otherwise.
- Native Meta Commerce catalogue messages are not implemented — catalogue sharing sends the rendered text (with the public catalogue link) as a plain message, which is the documented fallback.
- Media messages (images/documents) can be *sent* (`sendMediaMessage`) but storage remains disabled in this deployment, so there is no attachment upload flow to feed it yet.
- There is no dedicated "unresolved conversation" inbox UI for the ambiguous/unknown-contact cases — they surface via a Notification (Admin/Data Manager) and the `IntegrationWebhookEvent` row's `errorMessage`, not a dedicated screen.
- Template approval state is entirely operator-declared via `WHATSAPP_APPROVED_TEMPLATE_NAMES` — there is no live poll of Meta's template-approval status yet (the health endpoint's `getDiagnostics()` checks connectivity, not template approval).

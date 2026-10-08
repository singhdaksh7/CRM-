# Roles and Permissions

Three roles (`Role` enum): **ADMIN**, **DATA_MANAGER**, **FIELD_EXECUTIVE**. There are no others. Titles such as "Telecaller" or "Sales Executive" in the demo data are just labels on a Data Manager / Field Executive.

## Where authorization is enforced (three layers)

1. **Page gate**: `src/proxy.ts` → `canAccess(role, pathname)` using `NAV_ITEMS` in `src/lib/permissions.ts`. A role that may not see a page is redirected to its home page (`/dashboard`, or `/executive-dashboard` for field executives). `/settings/security` (own password) is open to every role (`SELF_SERVICE_PATHS`).
2. **API gate**: each route handler calls `requireSession([...roles])` (`src/lib/api-auth.ts`): 401 if signed out, 403 if the role isn't allowed. **`proxy.ts` does not check roles for `/api/*`.** If you add an endpoint, you own its role check.
3. **Row scope**: queries filter by `organizationId` and, for field executives, by assignment (`src/lib/lead-access.ts`, `src/lib/property-access.ts`, `visitRoleScopeWhere` in `lib/visits`).

Hiding a nav item is UX only. The security boundary is layers 2 and 3.

## Page access (`NAV_ITEMS`)

| Page | Admin | Data Manager | Field Executive |
|---|:-:|:-:|:-:|
| Dashboard `/dashboard` | ✅ | ✅ | → redirected to Today's Work |
| Today's Work `/executive-dashboard` | ✅ | ✅ | ✅ (home) |
| Owner Dashboard | ✅ | – | – |
| Properties | ✅ | ✅ | ✅ (view/report; write is API-gated) |
| Leads | ✅ | ✅ | ✅ (own + unassigned) |
| Catalogues | ✅ | ✅ | ✅ |
| Visits | ✅ | ✅ | ✅ (own) |
| Follow-ups | ✅ | ✅ | – |
| Notifications | ✅ | ✅ | ✅ |
| Property Portals (incl. Housing import) | ✅ | ✅ | – |
| Integrations (other) | ✅ | – | – |
| Inventory Partners, Requirements, Deals, Documents, WhatsApp inbox | ✅ | – | – |
| Property Issues | ✅ | – | – |
| Employees, Reports, Settings | ✅ | – | – |
| `/settings/security` (own password) | ✅ | ✅ | ✅ |

(The root `README.md` has an older role matrix; this table follows the current code.)

## API highlights

| Capability | Roles |
|---|---|
| Create lead, bulk lead actions, assign / auto-assign / transfer, share properties | Admin, Data Manager |
| Edit a lead (`PATCH /api/leads/[id]`), notes, log completed visit | Any signed-in role, but a field executive only on leads accessible to them (for completed-visit: assigned to them) |
| Create/send catalogue | create/revoke: Admin, Data Manager; **send** an existing one: also Field Executive |
| WhatsApp messages on a lead | all three (field executive within their leads) |
| WhatsApp **simulate** reply/status (MOCK only) | Admin, Data Manager |
| Create/update/delete properties, owners, partners | Admin, Data Manager (some deletes Admin only) |
| Deals and payments | Admin, Data Manager; deal **stage** updates also Field Executive; destructive deal/payment/owner actions Admin only |
| Documents upload/replace/delete | Admin, Data Manager. Download is category-gated (`lib/document-access.ts`) |
| Imports | Admin, Data Manager; **rollback** Admin only |
| Employees (create, edit, status, setup/reset links) | Admin only |
| Assignment rules, automation rules, system config, backups, audit log, demo-data tools | Admin only |
| Portal connections | Admin |

These are the `requireSession` lists found in `src/app/api`; always read the specific route before relying on this table.

## Field-executive scoping

- **Leads:** may open leads assigned to them **or unassigned** ones (so the "Unassigned" tab opens into the workspace). Never leads assigned to someone else. One definition: `isLeadAccessibleToUser` / `fieldExecutiveLeadReadWhere` in `lib/lead-access.ts`.
- **Visits:** only their assigned visits.
- **Property internals** (exact address, owner/partner contact, GPS) are shown only if the property is on one of their assigned visits (checked against both `Visit.propertyId` and `VisitProperty`) or in a catalogue for one of their leads (`lib/property-access.ts`). Everyone else sees public-safe fields.
- **Documents:** only `GENERAL`-category documents linked to their leads/properties.
- **Landing page** is `/executive-dashboard`; `/dashboard` redirects there.

## Organization scoping

Every query is scoped to the caller's organization, taken from the session (`getOrganizationId`), never from request input. A user with no valid organization fails closed with 401.

## Sessions and account lifecycle

- Credentials login, bcrypt hashes, JWT session. Login is rate-limited by IP+email (Redis; fails open without it).
- Each request re-validates the user (role, status, `authVersion`) through `src/lib/session-guard.ts`, so disabling an employee or resetting their password revokes live sessions.
- New employees get a **setup link** (`/setup-account/[token]`); forgotten passwords use `/forgot-password` → `/reset-password/[token]`. Admins generate setup/reset links (`/api/employees/[id]/setup-link`, `/reset-link`).

## Sensitive admin actions

Treat these as high-impact. They write audit entries and, in production, change real data:

- Creating/disabling employees; resetting passwords; changing roles.
- Import execution and rollback; bulk lead and property operations; exports (`/api/leads/export`, `/api/properties/export`, `/api/reports/export`).
- Assignment/automation rule changes (affect every new lead).
- Revoking a catalogue (kills a client's live link).
- WhatsApp provider change or test send (`/api/system/whatsapp-test-send`) which can message a real phone.
- Deal/payment edits and deletes; document deletes.
- Backup/restore validation records; "Delete Demo Data" (`/api/admin/demo-data`): never use in production.

Next: [INTEGRATIONS.md](INTEGRATIONS.md).

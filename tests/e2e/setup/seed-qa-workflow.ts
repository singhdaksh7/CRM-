/**
 * QA-only workflow seed: deterministic leads/properties/visits exercised
 * through the REAL application API (POST /api/properties, POST /api/leads,
 * catalogue share/preferences endpoints) so matching, auto-assignment, and
 * notification side-effects all run exactly as they would for a real user -
 * never a shortcut that fabricates a state the app itself couldn't produce.
 * The one deliberate exception is the "past visit with no outcome" scenario
 * (Visit row created directly via Prisma): the app has no UI path to
 * schedule a visit in the past - that state can only ever be *aged into* by
 * time passing on a real visit, so seeding it as already-past is the
 * faithful representation, not a shortcut around business logic.
 *
 * Local-only: refuses to run unless DATABASE_URL/BASE_URL point at
 * 127.0.0.1/localhost, same guard as seed-qa.ts and safety-guard.ts.
 */
import { PrismaClient } from "@prisma/client";
import { assertSafeBaseUrl, assertSafeDatabaseUrl } from "../helpers/safety-guard";
import { QA_PASSWORD, QA_USERS } from "./seed-qa";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? "3100"}`;
assertSafeBaseUrl(BASE_URL);
assertSafeDatabaseUrl(process.env.DATABASE_URL);

const prisma = new PrismaClient();

class ApiClient {
  private cookies = new Map<string, string>();

  private storeCookies(res: Response) {
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const raw of setCookie) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async login(email: string) {
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    this.storeCookies(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: this.cookieHeader() },
      body: new URLSearchParams({ email, password: QA_PASSWORD, csrfToken, json: "true" }),
      redirect: "manual",
    });
    this.storeCookies(res);
    if (res.status !== 200 && res.status !== 302) throw new Error(`login failed for ${email}: ${res.status}`);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: this.cookieHeader() },
      body: body ? JSON.stringify(body) : undefined,
    });
    this.storeCookies(res);
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    return json as T;
  }
}

interface PropertySeed {
  key: string;
  title: string;
  area: string;
  monthlyRent: number;
  bhk: number;
}

const PROPERTIES: PropertySeed[] = [
  { key: "A", title: "QA Property A - Rohini 2BHK", area: "Rohini", monthlyRent: 25000, bhk: 2 },
  { key: "B", title: "QA Property B - Dwarka 3BHK", area: "Dwarka", monthlyRent: 40000, bhk: 3 },
  { key: "C", title: "QA Property C - Rohini 2BHK", area: "Rohini", monthlyRent: 26000, bhk: 2 },
  { key: "D", title: "QA Property D - Pitampura 1BHK (Public)", area: "Pitampura", monthlyRent: 18000, bhk: 1 },
];

function propertyBody(p: PropertySeed) {
  return {
    title: p.title,
    propertyType: "APARTMENT",
    listingType: "RENT",
    assetClass: "RESIDENTIAL",
    status: "AVAILABLE",
    description: "Deterministic QA browser-validation fixture - synthetic data, not a real listing.",
    city: "Delhi",
    area: p.area,
    address: `${p.bhk * 100} QA Test Lane, ${p.area}, Delhi`,
    monthlyRent: p.monthlyRent,
    securityDeposit: p.monthlyRent * 2,
    bhk: p.bhk,
    bathrooms: Math.max(1, p.bhk - 1),
    furnishing: "SEMI_FURNISHED",
    builtUpAreaSqft: 400 + p.bhk * 250,
    parkingAvailable: true,
    ownerName: "QA Synthetic Owner",
    ownerPhone: "+911000099001",
    inventorySource: "DIRECT",
    amenities: ["Lift", "Power Backup"],
    images: [],
    // Distinctive, greppable synthetic values for the privacy audit spec to
    // assert are absent from every public/customer-facing surface - never
    // real PII, but specific enough that a leak can't be a coincidental
    // string match.
    buildingName: `QA-BUILDING-${p.key}`,
    flatNumber: `QA-FLAT-${p.key}-303`,
    gateNumber: `QA-GATE-${p.key}-2`,
    entryInstructions: `QA-ENTRY-INSTRUCTIONS-${p.key}: ring the QA synthetic bell twice`,
    internalNotes: `QA-INTERNAL-NOTES-${p.key}: synthetic broker-only note`,
    negotiationNotes: `QA-NEGOTIATION-NOTES-${p.key}: synthetic negotiation note`,
    hiddenRemarks: `QA-HIDDEN-REMARKS-${p.key}: synthetic hidden remark`,
  };
}

interface LeadSeed {
  key: string;
  clientName: string;
  status: string;
  assetClass?: "RESIDENTIAL" | "COMMERCIAL";
  preferredLocation: string;
  minBudget: number;
  maxBudget: number;
  assignedToId?: string | null;
}

async function main() {
  console.log(`[seed-qa-workflow] targeting ${BASE_URL}`);

  const admin = new ApiClient();
  await admin.login(QA_USERS.admin.email);

  // Resolve the seeded FE user ids (needed for lead assignment) - created by seed-qa.ts.
  const fe = await prisma.user.findUniqueOrThrow({ where: { email: QA_USERS.fieldExecutive.email } });
  const unassignedFe = await prisma.user.findUniqueOrThrow({ where: { email: QA_USERS.unassignedFieldExecutive.email } });

  // Every lead is explicitly assigned to the ASSIGNED FE (qa.fe) - never left
  // for POST /api/leads's autoAssignLead to pick, which can (and, discovered
  // here, actually did) hand an "unassigned" lead's catalogue-share property
  // access to qa.fe.unassigned, silently invalidating "unassigned FE has
  // zero legitimate property access" (the exact premise
  // unauthorized-property-access.spec.ts depends on).
  const LEADS: LeadSeed[] = [
    { key: "new", clientName: "QA Lead - New Requirement", status: "NEW", preferredLocation: "Rohini", minBudget: 20000, maxBudget: 30000, assignedToId: fe.id },
    { key: "pendingOutcome", clientName: "QA Lead - Pending Visit Outcome", status: "VISIT_SCHEDULED", preferredLocation: "Rohini", minBudget: 20000, maxBudget: 30000, assignedToId: fe.id },
    { key: "likedNoVisit", clientName: "QA Lead - Liked, No Visit Planned", status: "CONTACTED", preferredLocation: "Rohini", minBudget: 20000, maxBudget: 30000, assignedToId: fe.id },
    { key: "unsharedMatch", clientName: "QA Lead - Valid Unshared Match", status: "CONTACTED", preferredLocation: "Rohini", minBudget: 20000, maxBudget: 30000, assignedToId: fe.id },
    { key: "noMatches", clientName: "QA Lead - Zero Matches", status: "CONTACTED", assetClass: "COMMERCIAL", preferredLocation: "Nowhere Enclave", minBudget: 20000, maxBudget: 30000, assignedToId: fe.id },
    { key: "closedWon", clientName: "QA Lead - Closed Won", status: "CLOSED_WON", preferredLocation: "Rohini", minBudget: 20000, maxBudget: 30000, assignedToId: fe.id },
    { key: "multiVisit", clientName: "QA Lead - Multi-Property Visit", status: "VISIT_SCHEDULED", preferredLocation: "Rohini", minBudget: 15000, maxBudget: 45000, assignedToId: fe.id },
    { key: "publicCatalogue", clientName: "QA Lead - Public Catalogue Source", status: "PROPERTIES_SHARED", preferredLocation: "Pitampura", minBudget: 15000, maxBudget: 25000, assignedToId: fe.id },
  ];

  const leadIds: Record<string, string> = {};
  for (const l of LEADS) {
    const existing = await prisma.lead.findFirst({ where: { clientName: l.clientName } });
    if (existing) {
      leadIds[l.key] = existing.id;
      console.log(`[seed-qa-workflow] lead ${l.key} already exists: ${existing.id}`);
      continue;
    }
    const { lead } = await admin.request<{ lead: { id: string } }>("POST", "/api/leads", {
      clientName: l.clientName,
      phone: `+9198765${String(Math.floor(10000 + Math.random() * 89999))}`,
      source: "MANUAL",
      requirementType: "RENT",
      assetClass: l.assetClass ?? "RESIDENTIAL",
      preferredLocation: l.preferredLocation,
      minBudget: l.minBudget,
      maxBudget: l.maxBudget,
      status: l.status,
      priority: "WARM",
      assignedToId: l.assignedToId ?? null,
      suitableForTags: [],
    });
    leadIds[l.key] = lead.id;
    console.log(`[seed-qa-workflow] created lead ${l.key}: ${lead.id}`);
  }

  // --- Properties, created AFTER the leads above (real POST /api/properties
  // - runs resolveOrCreatePropertyLocality + recommendPropertyToWaitingLeads,
  // which is the ONLY thing that persists MatchRecommendation rows - the
  // lead-creation-time matching pass in POST /api/leads only logs
  // activity/notifications, it never writes MatchRecommendation. Properties
  // must therefore be created after the leads they're meant to match, or no
  // lead would ever show a match here - exactly the real-world order this
  // app is built around: new inventory gets matched against already-waiting
  // requirements, not the other way round). ---
  const propertyIds: Record<string, string> = {};
  for (const p of PROPERTIES) {
    const existing = await prisma.property.findFirst({ where: { title: p.title } });
    if (existing) {
      propertyIds[p.key] = existing.id;
      console.log(`[seed-qa-workflow] property ${p.key} already exists: ${existing.id}`);
      continue;
    }
    const { property } = await admin.request<{ property: { id: string } }>("POST", "/api/properties", propertyBody(p));
    propertyIds[p.key] = property.id;
    console.log(`[seed-qa-workflow] created property ${p.key}: ${property.id}`);
  }

  // --- "Liked, No Visit Planned": share a catalogue (Property A), then mark it LIKED via the public preferences endpoint. ---
  {
    const leadId = leadIds.likedNoVisit;
    let share = await prisma.catalogueShare.findFirst({ where: { leadId } });
    if (!share) {
      const created = await admin.request<{ catalogue: { id: string; token: string } }>("POST", `/api/leads/${leadId}/catalogues`, {
        title: "QA Shortlist",
        includePrice: true,
        includeAddress: true,
        includeBrokerage: false,
        properties: [{ propertyId: propertyIds.A, sortOrder: 0, priceVisible: true, addressVisible: true, brokerageVisible: false }],
      });
      share = await prisma.catalogueShare.findUniqueOrThrow({ where: { id: created.catalogue.id } });
      console.log(`[seed-qa-workflow] created catalogue share for likedNoVisit lead: ${share.id}`);
      // getNextAction's "Share Properties" gate checks lead.sharedProperties
      // (the legacy SharedPropertyLog audit trail), NOT catalogueShares - a
      // catalogue only counts as "shared" once actually sent. WHATSAPP_PROVIDER
      // is MOCK in .env.qa, so this never reaches a real WhatsApp API.
      await admin.request("POST", `/api/leads/${leadId}/catalogues/${share.id}/send`);
      console.log(`[seed-qa-workflow] sent catalogue (mock WhatsApp) for likedNoVisit lead`);
    }
    const existingPref = await prisma.cataloguePropertyPreference.findFirst({ where: { leadId, propertyId: propertyIds.A } });
    if (!existingPref) {
      const anon = new ApiClient();
      await anon.request("POST", `/api/catalogues/public/${share.token}/preferences`, { propertyId: propertyIds.A, status: "LIKED" });
      console.log(`[seed-qa-workflow] marked property A LIKED for likedNoVisit lead`);
    }
  }

  // --- "Pending Visit Outcome": a real-looking Visit, but dated in the past with no outcome - the one Prisma-direct step (see file header). ---
  {
    const leadId = leadIds.pendingOutcome;
    const existingVisit = await prisma.visit.findFirst({ where: { leadId } });
    if (!existingVisit) {
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      await prisma.visit.create({
        data: {
          organizationId: "org_default",
          leadId,
          propertyId: propertyIds.A,
          assignedToId: fe.id,
          createdById: fe.id,
          visitDate: pastDate,
          visitTime: "11:00",
          status: "SCHEDULED",
          properties: { create: [{ propertyId: propertyIds.A }] },
        },
      });
      console.log(`[seed-qa-workflow] created past unresolved visit for pendingOutcome lead`);
    }
  }

  // --- "Multi-Property Visit": a future visit spanning Properties A, C, D, assigned to the FE. ---
  {
    const leadId = leadIds.multiVisit;
    const existingVisit = await prisma.visit.findFirst({ where: { leadId } });
    if (!existingVisit) {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await prisma.visit.create({
        data: {
          organizationId: "org_default",
          leadId,
          propertyId: propertyIds.A,
          assignedToId: fe.id,
          createdById: fe.id,
          visitDate: futureDate,
          visitTime: "15:00",
          status: "SCHEDULED",
          properties: { create: [{ propertyId: propertyIds.A }, { propertyId: propertyIds.C }, { propertyId: propertyIds.D }] },
        },
      });
      console.log(`[seed-qa-workflow] created multi-property visit (A, C, D) for multiVisit lead`);
    }
  }

  // --- Public catalogue token, for public-catalogue QA (Step 26/27) - a
  // dedicated lead, deliberately separate from "unsharedMatch" above so
  // creating this share never contaminates that lead's sharedProperties===0
  // assertion. ---
  let publicCatalogueToken: string | null = null;
  {
    let share = await prisma.catalogueShare.findFirst({ where: { leadId: leadIds.publicCatalogue } });
    if (!share) {
      const created = await admin.request<{ catalogue: { id: string; token: string } }>("POST", `/api/leads/${leadIds.publicCatalogue}/catalogues`, {
        title: "QA Public Catalogue",
        includePrice: true,
        includeAddress: true,
        includeBrokerage: false,
        properties: [{ propertyId: propertyIds.D, sortOrder: 0, priceVisible: true, addressVisible: true, brokerageVisible: false }],
      });
      share = await prisma.catalogueShare.findUniqueOrThrow({ where: { id: created.catalogue.id } });
      console.log(`[seed-qa-workflow] created public catalogue share (Property D): token=${share.token}`);
    }
    publicCatalogueToken = share.token;
  }

  console.log("[seed-qa-workflow] done.");
  console.log(JSON.stringify({ propertyIds, leadIds, publicCatalogueToken, fe: fe.id, unassignedFe: unassignedFe.id }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * QA-only seed for the release-candidate coverage gaps: Follow-up, Visit
 * Outcome, and Deal close-out. Separate file from seed-qa-workflow.ts so
 * that file's already-verified leads/properties (whose exact
 * matchRecommendations/sharedProperties/visit state several existing specs
 * assert on) are never at risk of being touched by this round's additions.
 *
 * Same rules as seed-qa-workflow.ts: built through the REAL application API
 * wherever one exists (POST /api/properties, POST /api/leads, POST
 * /api/deals) - the one Prisma-direct step is the Visit Outcome lead's past
 * SCHEDULED visit with no outcome, which (as before) the app has no UI path
 * to create directly; it can only ever be aged into by time passing on a
 * real visit.
 *
 * Local-only: refuses to run unless DATABASE_URL/BASE_URL point at
 * 127.0.0.1/localhost.
 */
import { PrismaClient } from "@prisma/client";
import { assertSafeBaseUrl, assertSafeDatabaseUrl } from "../helpers/safety-guard";
import { QA_USERS } from "./seed-qa";

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
      body: new URLSearchParams({ email, password: "QaTest@12345", csrfToken, json: "true" }),
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

async function main() {
  console.log(`[seed-qa-release-candidate] targeting ${BASE_URL}`);

  const admin = new ApiClient();
  await admin.login(QA_USERS.admin.email);
  const fe = await prisma.user.findUniqueOrThrow({ where: { email: QA_USERS.fieldExecutive.email } });

  // --- Visit Outcome: a dedicated lead + a past, SCHEDULED, no-outcome
  // visit - separate from seed-qa-workflow.ts's "pendingOutcome" lead, whose
  // no-outcome state the Next Action spec depends on staying pristine. ---
  let visitOutcomeLeadId: string;
  {
    const existing = await prisma.lead.findFirst({ where: { clientName: "QA Lead - Visit Outcome Workflow" } });
    if (existing) {
      visitOutcomeLeadId = existing.id;
      console.log(`[seed-qa-release-candidate] lead visitOutcome already exists: ${existing.id}`);
    } else {
      const { lead } = await admin.request<{ lead: { id: string } }>("POST", "/api/leads", {
        clientName: "QA Lead - Visit Outcome Workflow",
        phone: `+9198764${String(Math.floor(10000 + Math.random() * 89999))}`,
        source: "MANUAL",
        requirementType: "RENT",
        assetClass: "RESIDENTIAL",
        preferredLocation: "Rohini",
        minBudget: 20000,
        maxBudget: 30000,
        status: "VISIT_SCHEDULED",
        priority: "WARM",
        assignedToId: fe.id,
        suitableForTags: [],
      });
      visitOutcomeLeadId = lead.id;
      console.log(`[seed-qa-release-candidate] created lead visitOutcome: ${lead.id}`);
    }

    const propertyA = await prisma.property.findFirstOrThrow({ where: { title: "QA Property A - Rohini 2BHK" } });
    const existingVisit = await prisma.visit.findFirst({ where: { leadId: visitOutcomeLeadId } });
    if (!existingVisit) {
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.visit.create({
        data: {
          organizationId: "org_default",
          leadId: visitOutcomeLeadId,
          propertyId: propertyA.id,
          assignedToId: fe.id,
          createdById: fe.id,
          visitDate: pastDate,
          visitTime: "14:00",
          status: "SCHEDULED",
          properties: { create: [{ propertyId: propertyA.id }] },
        },
      });
      console.log(`[seed-qa-release-candidate] created past unresolved visit for Visit Outcome lead`);
    }
  }

  // --- Deal: a dedicated lead + a dedicated property (never shared with
  // any other spec's assertions), plus a real Deal record via POST
  // /api/deals - there is no product UI to CREATE a deal (only to progress
  // an existing one's stage via DealActions), so this is the real
  // authorized-admin creation path, analogous to using the API for
  // property/lead creation elsewhere in this seed. ---
  {
    const existingProperty = await prisma.property.findFirst({ where: { title: "QA Property E - Deal Target" } });
    let propertyEId: string;
    if (existingProperty) {
      propertyEId = existingProperty.id;
    } else {
      const { property } = await admin.request<{ property: { id: string } }>("POST", "/api/properties", {
        title: "QA Property E - Deal Target",
        propertyType: "APARTMENT",
        listingType: "RENT",
        assetClass: "RESIDENTIAL",
        status: "AVAILABLE",
        description: "Deterministic QA browser-validation fixture for the Deal close-out spec - synthetic data, not a real listing.",
        city: "Delhi",
        area: "Rohini",
        address: "500 QA Test Lane, Rohini, Delhi",
        monthlyRent: 27000,
        securityDeposit: 54000,
        bhk: 2,
        bathrooms: 2,
        furnishing: "SEMI_FURNISHED",
        builtUpAreaSqft: 900,
        parkingAvailable: true,
        ownerName: "QA Synthetic Owner",
        ownerPhone: "+911000099002",
        inventorySource: "DIRECT",
        amenities: [],
        images: [],
      });
      propertyEId = property.id;
      console.log(`[seed-qa-release-candidate] created property E (deal target): ${propertyEId}`);
    }

    const existingLead = await prisma.lead.findFirst({ where: { clientName: "QA Lead - Deal Workflow" } });
    let dealLeadId: string;
    if (existingLead) {
      dealLeadId = existingLead.id;
    } else {
      const { lead } = await admin.request<{ lead: { id: string } }>("POST", "/api/leads", {
        clientName: "QA Lead - Deal Workflow",
        phone: `+9198763${String(Math.floor(10000 + Math.random() * 89999))}`,
        source: "MANUAL",
        requirementType: "RENT",
        assetClass: "RESIDENTIAL",
        preferredLocation: "Rohini",
        minBudget: 20000,
        maxBudget: 30000,
        status: "NEGOTIATION",
        priority: "HOT",
        assignedToId: fe.id,
        suitableForTags: [],
      });
      dealLeadId = lead.id;
      console.log(`[seed-qa-release-candidate] created lead dealWorkflow: ${dealLeadId}`);
    }

    const existingDeal = await prisma.deal.findFirst({ where: { leadId: dealLeadId } });
    if (!existingDeal) {
      const { deal } = await admin.request<{ deal: { id: string } }>("POST", "/api/deals", {
        dealType: "RENTAL",
        stage: "NEGOTIATION",
        status: "OPEN",
        leadId: dealLeadId,
        propertyId: propertyEId,
        assignedToId: fe.id,
        notes: "QA deterministic fixture for the Deal close-out spec.",
      });
      console.log(`[seed-qa-release-candidate] created deal: ${deal.id}`);
    } else {
      console.log(`[seed-qa-release-candidate] deal already exists: ${existingDeal.id}`);
    }
  }

  console.log("[seed-qa-release-candidate] done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

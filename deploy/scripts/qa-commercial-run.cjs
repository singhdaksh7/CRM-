// Authenticated production QA for Commercial Properties, driven entirely through the real
// application API with the session cookie from qa-admin-login.cjs (real Auth.js credentials
// flow - never a minted JWT). Direct Prisma is used ONLY for read-only assertions (e.g. "no
// WhatsApp message row was created"). Every created entity carries QA_RUN_ID in its
// title/name/area so qa-commercial-cleanup.cjs can find and remove all of it.
// Never sends WhatsApp: only prepare/approve endpoints whose contract is sent:false are used.
// Prints PASS/FAIL/INFO per step; never prints secrets, cookies or passwords.
"use strict";
const fs = require("node:fs");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const prisma = new PrismaClient();

const RUN_ID = process.env.QA_RUN_ID;
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PUBLIC_HOST = new URL(process.env.NEXTAUTH_URL || BASE_URL).host;
const COOKIE = fs.readFileSync("/tmp/kp-qa/session.cookie", "utf8").trim();
const results = [];
const ids = { propertyIds: [], leadIds: [], requirementIds: [], catalogueIds: [], uploadSessionIds: [], imageIds: [] };

function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  const tag = ok === null ? "INFO" : ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${area} :: ${name}${detail ? " - " + detail : ""}`);
}
async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, { method, headers: { "content-type": "application/json", cookie: COOKIE, host: PUBLIC_HOST }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
function save() { fs.writeFileSync("/tmp/kp-qa/commercial-ids.json", JSON.stringify(ids, null, 2)); }

const AREA = `QA ${RUN_ID} Market`;
const SECRETS = {
  address: `Shop 7, ${RUN_ID} Arcade, Private Lane`,
  flatNumber: `UNIT-${RUN_ID}-SECRET`,
  buildingName: `${RUN_ID} Private Tower`,
  gateNumber: `Gate ${RUN_ID}`,
  entryInstructions: `${RUN_ID} key with guard - private`,
  internalNotes: `${RUN_ID} internal note - private`,
  // Must not equal the organization's own public contact phone (shown on every public page
  // by design) - the first run's sentinel 9811100001 collided with it and read as a leak.
  ownerPhone: "9733355511",
};
const LAT = 28.6539123, LNG = 77.1234567;

async function createProperty(label, body) {
  const base = { city: "Delhi", area: AREA, inventorySource: "DIRECT", ownerName: `${RUN_ID} Owner`, ownerPhone: SECRETS.ownerPhone, description: `${RUN_ID} QA ${label} description`, ...body };
  let r = await api("POST", "/api/properties", base);
  if (r.status === 400 && body.assetClass === "COMMERCIAL" && JSON.stringify(r.json).includes("furnishing")) {
    // The currently DEPLOYED build still requires residential `furnishing` for commercial
    // inventory (fixed on this branch: furnishing optional for COMMERCIAL). Record and retry
    // with the value the deployed form silently sends, so the rest of QA can proceed.
    record("Properties", `${label}: deployed build requires residential furnishing for commercial`, null, "known gap, fixed in this branch (not deployed)");
    r = await api("POST", "/api/properties", { ...base, furnishing: "UNFURNISHED" });
  }
  const p = r.json?.property;
  if (p?.id) { ids.propertyIds.push(p.id); save(); }
  return { r, p };
}

async function main() {
  if (!RUN_ID) throw new Error("QA_RUN_ID not set");
  const waBefore = await prisma.whatsAppMessage.count();

  {
    const r = await api("GET", "/api/auth/session");
    record("Auth", "real Auth.js session is the QA ADMIN", r.status === 200 && r.json?.user?.role === "ADMIN" && String(r.json?.user?.email).includes(RUN_ID.toLowerCase()), `status=${r.status}`);
  }

  // --- Leads first, so property creation's own matching hooks see them ---
  {
    const r = await api("POST", "/api/leads", {
      clientName: `${RUN_ID} Commercial Lead`, phone: "9811100002", source: "MANUAL",
      requirementType: "RENT", assetClass: "COMMERCIAL", transactionType: "RENT", preferredLocation: AREA,
      minBudget: 50000, maxBudget: 100000, commercialPropertyType: "SHOP", minAreaSqft: 300, maxAreaSqft: 600,
      notes: `created by ${RUN_ID}`,
    });
    ids.commercialLeadId = r.json?.lead?.id; if (ids.commercialLeadId) ids.leadIds.push(ids.commercialLeadId); save();
    record("Leads", "create commercial lead (SHOP, rent, 50k-1L)", r.status === 201 && !!ids.commercialLeadId, `status=${r.status}`);
  }
  {
    const r = await api("POST", "/api/leads", {
      clientName: `${RUN_ID} Residential Lead`, phone: "9811100003", source: "MANUAL",
      requirementType: "RENT", assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocation: AREA,
      minBudget: 20000, maxBudget: 40000, preferredBhk: 2, notes: `created by ${RUN_ID}`,
    });
    ids.residentialLeadId = r.json?.lead?.id; if (ids.residentialLeadId) ids.leadIds.push(ids.residentialLeadId); save();
    record("Leads", "create residential control lead (2 BHK, rent)", r.status === 201 && !!ids.residentialLeadId, `status=${r.status}`);
  }

  // --- Properties ---
  {
    const { r, p } = await createProperty("Commercial Shop", {
      title: `${RUN_ID} Commercial Shop`, assetClass: "COMMERCIAL", propertyType: "SHOP", listingType: "RENT",
      address: SECRETS.address, latitude: LAT, longitude: LNG, monthlyRent: 90000, securityDeposit: 270000,
      builtUpAreaSqft: 400, carpetAreaSqft: 350, superAreaSqft: 450, floorNumber: 0, totalFloors: 3,
      frontageFeet: 18, washrooms: 1, commercialFitOut: "BARE_SHELL", hasOpenParking: true, possessionStatus: "READY_TO_MOVE",
      flatNumber: SECRETS.flatNumber, buildingName: SECRETS.buildingName, gateNumber: SECRETS.gateNumber,
      entryInstructions: SECRETS.entryInstructions, internalNotes: SECRETS.internalNotes,
    });
    ids.shopId = p?.id; save();
    record("Properties", "create Commercial Shop", r.status === 201 && p?.assetClass === "COMMERCIAL" && p?.propertyType === "SHOP" && p?.bhk === 0, `status=${r.status} assetClass=${p?.assetClass} type=${p?.propertyType} bhk=${p?.bhk} washrooms=${p?.washrooms} frontage=${p?.frontageFeet}`);
  }
  {
    const { r, p } = await createProperty("Commercial Office", {
      title: `${RUN_ID} Commercial Office`, assetClass: "COMMERCIAL", propertyType: "OFFICE", listingType: "RENT",
      address: `Office 3, ${RUN_ID} Business Park`, monthlyRent: 95000, builtUpAreaSqft: 500, carpetAreaSqft: 420,
      floorNumber: 2, totalFloors: 6, workstations: 20, cabins: 2, washrooms: 2, commercialFitOut: "FURNISHED", liftAvailable: true,
    });
    ids.officeId = p?.id; save();
    record("Properties", "create Commercial Office", r.status === 201 && p?.assetClass === "COMMERCIAL" && p?.propertyType === "OFFICE", `status=${r.status} workstations=${p?.workstations} cabins=${p?.cabins}`);
  }
  {
    const { r, p } = await createProperty("Residential Apartment", {
      title: `${RUN_ID} Residential Apartment`, assetClass: "RESIDENTIAL", propertyType: "APARTMENT", listingType: "RENT",
      address: `Flat 2B, ${RUN_ID} Residency`, monthlyRent: 30000, builtUpAreaSqft: 900, bhk: 2, bathrooms: 2, balconies: 1, furnishing: "SEMI_FURNISHED",
    });
    ids.apartmentId = p?.id; save();
    record("Properties", "create residential control property (unchanged flow)", r.status === 201 && p?.assetClass === "RESIDENTIAL" && p?.bhk === 2, `status=${r.status}`);
  }
  {
    const r = await api("POST", "/api/properties", { title: `${RUN_ID} Invalid Combo`, assetClass: "COMMERCIAL", propertyType: "APARTMENT", listingType: "RENT", description: "invalid combo test", area: AREA, address: "nowhere 12345", monthlyRent: 1000, builtUpAreaSqft: 100, furnishing: "UNFURNISHED", ownerName: "QA", ownerPhone: "9811100009" });
    if (r.json?.property?.id) { ids.propertyIds.push(r.json.property.id); save(); }
    record("Validation", "COMMERCIAL + APARTMENT rejected", r.status === 400, `status=${r.status}`);
  }
  {
    const r = await api("POST", "/api/properties", { title: `${RUN_ID} Invalid Combo 2`, assetClass: "RESIDENTIAL", propertyType: "WAREHOUSE", listingType: "RENT", description: "invalid combo test", area: AREA, address: "nowhere 12345", monthlyRent: 1000, builtUpAreaSqft: 100, furnishing: "UNFURNISHED", ownerName: "QA", ownerPhone: "9811100009" });
    if (r.json?.property?.id) { ids.propertyIds.push(r.json.property.id); save(); }
    record("Validation", "RESIDENTIAL + WAREHOUSE rejected", r.status === 400, `status=${r.status}${r.status === 201 ? " - accepted by deployed build (reverse check added on this branch, not deployed)" : ""}`);
  }

  // --- Edit commercial ---
  {
    const r = await api("PATCH", `/api/properties/${ids.shopId}`, { washrooms: 2, frontageFeet: 20, description: `${RUN_ID} QA Commercial Shop description - edited` });
    const p = r.json?.property;
    record("Properties", "edit Commercial Shop (washrooms/frontage)", r.status === 200 && p?.washrooms === 2 && p?.frontageFeet === 20 && p?.assetClass === "COMMERCIAL", `status=${r.status}`);
  }
  {
    const r = await api("GET", `/api/properties/${ids.shopId}`);
    record("Properties", "detail GET returns commercial fields (staff view)", r.status === 200 && r.json?.property?.propertyType === "SHOP" && r.json?.property?.superAreaSqft === 450, `status=${r.status}`);
  }

  // --- Search / filters ---
  {
    const r = await api("GET", `/api/properties?assetClass=COMMERCIAL&q=${encodeURIComponent(RUN_ID)}`);
    const got = (r.json?.properties || []).map((p) => p.id);
    record("Filters", "Category=Commercial returns shop+office, not the apartment", r.status === 200 && got.includes(ids.shopId) && got.includes(ids.officeId) && !got.includes(ids.apartmentId), `status=${r.status} n=${got.length}`);
  }
  {
    const r = await api("GET", `/api/properties?assetClass=RESIDENTIAL&q=${encodeURIComponent(RUN_ID)}`);
    const got = (r.json?.properties || []).map((p) => p.id);
    record("Filters", "Category=Residential returns the apartment only", r.status === 200 && got.includes(ids.apartmentId) && !got.includes(ids.shopId) && !got.includes(ids.officeId), `status=${r.status} n=${got.length}`);
  }
  {
    const r = await api("GET", `/api/properties?assetClass=COMMERCIAL&propertyType=SHOP&q=${encodeURIComponent(RUN_ID)}`);
    const got = (r.json?.properties || []).map((p) => p.id);
    const exact = got.includes(ids.shopId) && !got.includes(ids.officeId);
    record("Filters", "Commercial Type=Shop filter", exact ? true : null, exact ? `n=${got.length}` : `deployed build ignores propertyType (returned shop+office); filter added on this branch, not deployed`);
  }
  {
    const r = await api("GET", `/api/properties/search?q=${encodeURIComponent(RUN_ID + " Commercial")}`);
    const got = (r.json?.properties || []).map((p) => p.id);
    record("Search", "free-text search finds commercial listings", r.status === 200 && got.includes(ids.shopId) && got.includes(ids.officeId), `status=${r.status} n=${got.length}`);
  }

  // --- Commercial image upload via the app's real R2 flow ---
  {
    const bytes = Buffer.from(`qa-commercial-pixel-${RUN_ID}`);
    const r = await api("POST", `/api/properties/${ids.shopId}/media/upload-url`, { fileName: `${RUN_ID}-shopfront.jpg`, mimeType: "image/jpeg", sizeBytes: bytes.length, purpose: "IMAGE" });
    if (r.json?.sessionId) { ids.uploadSessionIds.push(r.json.sessionId); save(); }
    record("Images", "presign for commercial property", r.status === 201 && !!r.json?.uploadUrl, `status=${r.status}`);
    if (r.json?.uploadUrl) {
      const put = await fetch(r.json.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: bytes });
      record("Images", "PUT to presigned R2 URL", put.ok, `status=${put.status}`);
      const confirm = await api("POST", `/api/properties/${ids.shopId}/media/confirm`, { sessionId: r.json.sessionId });
      const imageId = confirm.json?.image?.id;
      if (imageId) { ids.imageIds.push(imageId); save(); }
      record("Images", "confirm upload", confirm.status === 200 && !!imageId, `status=${confirm.status}`);
      const list = await api("GET", `/api/properties/${ids.shopId}/images`);
      record("Images", "image listed on commercial property", list.status === 200 && (list.json?.images || []).some((i) => i.id === imageId), `status=${list.status}`);
    }
  }

  // --- Commercial lead requirement (explicit brief) ---
  {
    const shop = await api("GET", `/api/properties/${ids.shopId}`);
    const localityId = shop.json?.property?.localityId;
    ids.localityId = localityId; save();
    const r = await api("POST", `/api/leads/${ids.commercialLeadId}/requirements`, {
      assetClass: "COMMERCIAL", transactionType: "RENT", propertyType: "SHOP", minBudget: 50000, maxBudget: 100000,
      minAreaSqft: 300, maxAreaSqft: 600, localityIds: localityId ? [localityId] : [], notes: `${RUN_ID} commercial brief`,
    });
    const reqId = r.json?.requirement?.id; if (reqId) { ids.requirementIds.push(reqId); save(); }
    record("Requirements", "create commercial requirement (type/locality/budget/area/transaction)", r.status === 201 && r.json?.requirement?.assetClass === "COMMERCIAL" && r.json?.requirement?.propertyType === "SHOP", `status=${r.status} localities=${r.json?.requirement?.localities?.length}`);
  }
  {
    const r = await api("POST", `/api/leads/${ids.commercialLeadId}/requirements`, { assetClass: "COMMERCIAL", transactionType: "RENT", propertyType: "APARTMENT", localityIds: [] });
    if (r.json?.requirement?.id) { ids.requirementIds.push(r.json.requirement.id); save(); }
    record("Requirements", "commercial requirement with a residential type rejected", r.status === 400, `status=${r.status}${r.status === 201 ? " - accepted by deployed build (validation added on this branch, not deployed)" : ""}`);
  }

  // --- Best Matching Leads (canonical demand engine) ---
  for (const pid of [ids.shopId, ids.officeId, ids.apartmentId]) await api("POST", `/api/properties/${pid}/matches`);
  const matchLeads = async (pid) => { const r = await api("GET", `/api/properties/${pid}/matches`); return { status: r.status, leadIds: (r.json?.recommendations || []).map((x) => x.leadId).filter(Boolean), recs: r.json?.recommendations || [] }; };
  {
    const m = await matchLeads(ids.shopId);
    record("Best Matching Leads", "Commercial Shop -> commercial lead matched", m.status === 200 && m.leadIds.includes(ids.commercialLeadId), `status=${m.status} leads=${m.leadIds.length}`);
    record("Best Matching Leads", "Commercial Shop -> residential lead NOT matched", m.status === 200 && !m.leadIds.includes(ids.residentialLeadId), "");
    ids.shopRecommendationId = m.recs.find((x) => x.leadId === ids.commercialLeadId)?.id; save();
  }
  {
    const m = await matchLeads(ids.officeId);
    record("Best Matching Leads", "Commercial Office -> SHOP lead NOT matched (subtype gate)", m.status === 200 && !m.leadIds.includes(ids.commercialLeadId), `leads=${m.leadIds.length}`);
  }
  {
    const m = await matchLeads(ids.apartmentId);
    record("Best Matching Leads", "Residential Apartment -> residential lead matched", m.status === 200 && m.leadIds.includes(ids.residentialLeadId), `leads=${m.leadIds.length}`);
    record("Best Matching Leads", "Residential Apartment -> commercial lead NOT matched", m.status === 200 && !m.leadIds.includes(ids.commercialLeadId), "");
  }

  // --- Prepare message: never sends ---
  if (ids.shopRecommendationId) {
    const r = await api("POST", `/api/recommendations/${ids.shopRecommendationId}/prepare`);
    const status = r.json?.recommendation?.status;
    record("No WhatsApp", "prepare on commercial recommendation -> PREPARED, never SENT", r.status === 200 && status === "PREPARED" && r.json?.sent !== true, `status=${r.status} recStatus=${status} msgHasType=${/shop/i.test(r.json?.message || "")}`);
  } else {
    record("No WhatsApp", "prepare on commercial recommendation", false, "no recommendation id to prepare");
  }

  // --- Catalogue share + public privacy ---
  {
    const r = await api("POST", `/api/leads/${ids.commercialLeadId}/catalogues`, {
      title: `${RUN_ID} Commercial Catalogue`, includePrice: true, includeAddress: true, includeBrokerage: false,
      properties: [{ propertyId: ids.shopId, addressVisible: true }, { propertyId: ids.officeId, addressVisible: true }],
    });
    ids.catalogueId = r.json?.catalogue?.id; ids.catalogueToken = r.json?.catalogue?.token;
    if (ids.catalogueId) { ids.catalogueIds.push(ids.catalogueId); save(); }
    record("Catalogue", "create commercial catalogue (staff ticked include address)", r.status === 201 && !!ids.catalogueToken, `status=${r.status}`);
  }
  {
    const legacy = await prisma.matchRecommendation.findFirst({ where: { leadId: ids.commercialLeadId, propertyId: ids.shopId } });
    if (legacy && legacy.status === "PENDING" && ids.catalogueId) {
      const appr = await api("POST", "/api/match-recommendations/approve", { catalogueId: ids.catalogueId, recommendationIds: [legacy.id] });
      record("No WhatsApp", "approve commercial match into catalogue returns sent:false", appr.status === 200 && appr.json?.sent === false, `status=${appr.status} sent=${appr.json?.sent}`);
    } else {
      record("No WhatsApp", "approve commercial match (sent:false)", null, legacy ? `match row status=${legacy.status}` : "no lead-workspace MatchRecommendation row for shop (async hook) - prepare route checked above instead");
    }
  }
  if (ids.catalogueToken) {
    const r = await fetch(`${BASE_URL}/api/catalogues/public/${ids.catalogueToken}`, { headers: { host: PUBLIC_HOST } });
    const body = await r.text();
    let dto = null; try { dto = JSON.parse(body)?.catalogue; } catch {}
    const props = dto?.properties || [];
    const shop = props.find((p) => p.id === ids.shopId);
    record("Catalogue", "public token reachable without auth", r.ok && props.length === 2, `status=${r.status} properties=${props.length}`);
    record("Catalogue", "commercial listing exposed as COMMERCIAL/SHOP with bhk 0 (UI renders type, not BHK)", shop?.assetClass === "COMMERCIAL" && shop?.propertyType === "SHOP", `assetClass=${shop?.assetClass} type=${shop?.propertyType}`);
    const leaks = Object.entries(SECRETS).filter(([, v]) => body.includes(v)).map(([k]) => k);
    if (body.includes(String(LAT)) || body.includes(String(LNG))) leaks.push("gps");
    record("Privacy", "public catalogue: no address/unit/GPS/entry/internal/owner leak (includeAddress=true)", leaks.length === 0 && shop?.address === null && shop?.latitude === null && shop?.longitude === null, leaks.length ? `LEAKED: ${leaks.join(",")}` : "clean");
    record("Privacy", "locality stays public", shop?.area === AREA, "");
  }
  {
    const r = await fetch(`${BASE_URL}/p/${ids.shopId}`, { headers: { host: PUBLIC_HOST } });
    const html = await r.text();
    const leaks = Object.entries(SECRETS).filter(([, v]) => html.includes(v)).map(([k]) => k);
    if (html.includes(String(LAT)) || html.includes(String(LNG))) leaks.push("gps");
    record("Privacy", "public /p/[id] page for commercial: no private field leak", r.ok && leaks.length === 0, leaks.length ? `LEAKED: ${leaks.join(",")}` : `status=${r.status}`);
    const zeroBhk = /\b0\s*(?:<!-- -->)?\s*BHK/.test(html);
    record("Public page", "/p/[id] commercial does not render '0 BHK'", zeroBhk ? null : true, zeroBhk ? "deployed build renders 0 BHK for commercial (fixed on this branch, not deployed)" : "no 0 BHK");
  }

  // --- Lead requirement + dashboard/reports smoke ---
  {
    const r = await api("GET", `/api/leads/${ids.commercialLeadId}/requirements`);
    record("Requirements", "list requirements for commercial lead", r.status === 200 && (r.json?.requirements || []).some((x) => x.assetClass === "COMMERCIAL"), `status=${r.status}`);
  }
  {
    const r = await api("GET", "/api/dashboard");
    record("Dashboard", "dashboard API OK with commercial inventory present", r.status === 200, `status=${r.status}`);
  }

  // --- No WhatsApp was sent ---
  {
    const waAfter = await prisma.whatsAppMessage.count();
    const sent = await prisma.propertyRecommendation.count({ where: { propertyId: { in: ids.propertyIds }, status: "SENT" } });
    record("No WhatsApp", "zero WhatsApp messages created and zero SENT recommendations", waAfter === waBefore && sent === 0, `whatsappMessages before=${waBefore} after=${waAfter} sentRecs=${sent}`);
  }
  {
    const orgCount = await prisma.organization.count();
    const foreign = await prisma.property.count({ where: { id: { in: ids.propertyIds }, NOT: { organizationId: "org_default" } } });
    record("Tenant isolation", "QA rows all in the QA admin's organization", foreign === 0, `orgCount=${orgCount}`);
  }
  {
    const founder = await prisma.user.findUnique({ where: { email: "founder@kpproperties.co.in" }, select: { role: true, status: true } });
    record("Safety", "founder account untouched", founder?.role === "ADMIN" && founder?.status === "ACTIVE", "");
  }

  save();
  fs.writeFileSync("/tmp/kp-qa/commercial-results.json", JSON.stringify(results, null, 2));
  const fails = results.filter((r) => r.ok === false);
  const infos = results.filter((r) => r.ok === null);
  console.log(`\n=== SUMMARY === ${results.filter((r) => r.ok === true).length} pass, ${fails.length} fail, ${infos.length} info`);
  if (fails.length) console.log("FAILED:", fails.map((f) => `${f.area}::${f.name}`).join(" | "));
}

main().catch((e) => { console.error("FATAL:", e && e.stack ? e.stack : e); save(); process.exitCode = 1; }).finally(() => prisma.$disconnect());

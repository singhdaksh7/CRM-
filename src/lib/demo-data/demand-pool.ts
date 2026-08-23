/**
 * Deterministic demand-pool demo scenarios (rule 49). Every row is
 * organization-scoped to DEMO_ORGANIZATION_ID and demo-prefixed via
 * demoId()/demoCode() (idempotent re-seed, exact teardown match). No real
 * phone numbers (demoPhone() is structurally fake), no WhatsApp send - tiers
 * are computed by calling the REAL matching engine (scoreDemandCandidate)
 * against real demo properties already written by properties.ts, never
 * hardcoded, so this doubles as a live smoke test of the engine.
 *
 * Covers: 20+ contacts, a multi-requirement contact, EXACT/STRONG/STRETCH/
 * no-match outcomes, a DNC contact, an opted-out contact, a stale
 * requirement, a contact already converted to a Lead, a recommendation
 * already SENT (property-already-sent history), one PREPARED-but-unsent,
 * and both an INTERESTED and a NOT_INTERESTED recorded response.
 */
import type { Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { DEMO_ORGANIZATION_ID, demoId, demoCode, demoPhone } from "./constants";
import { scoreDemandCandidate, normalizeCustomerRequirement, candidateKeyFor, type NormalizedRequirement } from "../demand-matching";

const BASE_TIME = new Date("2026-08-19T09:00:00.000Z");
const days = (n: number) => new Date(BASE_TIME.getTime() + n * 24 * 60 * 60 * 1000);

const FIRST_NAMES = ["Rahul", "Priya", "Amit", "Neha", "Vikas", "Kavita", "Sanjay", "Anjali", "Rohit", "Simran", "Karan", "Divya", "Manoj", "Ritu", "Naveen", "Shweta", "Gaurav", "Meera", "Tarun", "Swati", "Vivek", "Nisha"] as const;
const LAST_NAMES = ["Sharma", "Verma", "Singh", "Kapoor", "Gupta", "Mehta", "Joshi", "Malhotra", "Chopra", "Kaur", "Tiwari", "Reddy", "Agarwal", "Bhatt", "Pandey", "Khanna", "Sethi", "Arora", "Bansal", "Tandon", "Sood", "Anand"] as const;

export interface DemandPoolResult {
  contacts: Array<{ id: string; requirementIds: string[] }>;
  requirements: string[];
  recommendations: string[];
}

/**
 * Persists the demand pool demo scenarios. `properties` should be the full
 * set already written by properties.ts (createDemoProperties().all) so
 * requirement budgets/localities can be derived from real, already-existing
 * inventory rather than a second parallel property fixture set.
 */
export async function createDemoDemandPool(properties: Property[], actor: User): Promise<DemandPoolResult> {
  const organizationId = DEMO_ORGANIZATION_ID;
  const residentialRent = properties.find((p) => p.assetClass === "RESIDENTIAL" && p.listingType === "RENT" && p.status === "AVAILABLE");
  const residentialSale = properties.find((p) => p.assetClass === "RESIDENTIAL" && p.listingType === "SALE" && p.status === "AVAILABLE");
  if (!residentialRent || !residentialSale) throw new Error("createDemoDemandPool requires at least one AVAILABLE residential RENT and one AVAILABLE residential SALE demo property to already exist");

  const contactIds: Array<{ id: string; requirementIds: string[] }> = [];
  const requirementIds: string[] = [];
  const recommendationIds: string[] = [];

  // --- 18 baseline contacts (deterministic names, ordinary ACTIVE status, one active RENT requirement each, no scripted matching outcome) ---
  for (let i = 1; i <= 18; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    const contact = await upsertContact(i, {
      name, phone: demoPhone(i, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id,
    });
    const requirement = await upsertRequirement(i, {
      customerContactId: contact.id, assetClass: "RESIDENTIAL", transactionType: "RENT",
      preferredLocalities: [residentialRent.area], minBudget: Math.round(residentialRent.monthlyRent! * 0.7), maxBudget: Math.round(residentialRent.monthlyRent! * 1.05),
      bhk: residentialRent.bhk, lastConfirmedAt: days(-5),
    });
    contactIds.push({ id: contact.id, requirementIds: [requirement.id] });
    requirementIds.push(requirement.id);
  }

  // --- Scenario: EXACT match - budget/locality/BHK all fit the residential rent property exactly ---
  const exactContact = await upsertContact(19, { name: "Arjun Malhotra", phone: demoPhone(19, 11), source: "REFERRAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const exactRequirement = await upsertRequirement(19, {
    customerContactId: exactContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT",
    preferredLocalities: [residentialRent.area], minBudget: Math.round(residentialRent.monthlyRent! * 0.8), maxBudget: residentialRent.monthlyRent!,
    bhk: residentialRent.bhk, furnishing: residentialRent.furnishing, lastConfirmedAt: days(-1),
  });

  // --- Scenario: STRETCH match - same property, but the requirement's max budget sits in the upper half of the stretch tolerance ---
  const stretchContact = await upsertContact(20, { name: "Kiran Rawat", phone: demoPhone(20, 11), source: "WHATSAPP", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const stretchRequirement = await upsertRequirement(20, {
    customerContactId: stretchContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT",
    preferredLocalities: [residentialRent.area], minBudget: Math.round(residentialRent.monthlyRent! * 0.6), maxBudget: Math.round(residentialRent.monthlyRent! / 1.15),
    bhk: residentialRent.bhk, lastConfirmedAt: days(-2),
  });

  // --- Scenario: no match - budget far beyond even the stretch tolerance; must never surface a recommendation row ---
  const noMatchContact = await upsertContact(21, { name: "Deepak Chaudhary", phone: demoPhone(21, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const noMatchRequirement = await upsertRequirement(21, {
    customerContactId: noMatchContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT",
    preferredLocalities: [residentialRent.area], minBudget: 1000, maxBudget: Math.round(residentialRent.monthlyRent! / 3),
    bhk: residentialRent.bhk, lastConfirmedAt: days(-3),
  });

  // --- Scenario: DNC contact - never a match candidate regardless of fit ---
  const dncContact = await upsertContact(22, { name: "Harish Yadav", phone: demoPhone(22, 11), source: "MANUAL", status: "DO_NOT_CONTACT", doNotContact: true, whatsAppOptOut: false, createdById: actor.id });
  const dncRequirement = await upsertRequirement(22, { customerContactId: dncContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocalities: [residentialRent.area], minBudget: 1, maxBudget: residentialRent.monthlyRent!, bhk: residentialRent.bhk, lastConfirmedAt: days(-1) });

  // --- Scenario: WhatsApp opt-out contact - eligible in principle but never a send candidate ---
  const optOutContact = await upsertContact(23, { name: "Poonam Rekha", phone: demoPhone(23, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: true, createdById: actor.id });
  const optOutRequirement = await upsertRequirement(23, { customerContactId: optOutContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocalities: [residentialRent.area], minBudget: 1, maxBudget: residentialRent.monthlyRent!, bhk: residentialRent.bhk, lastConfirmedAt: days(-1) });

  // --- Scenario: multi-requirement contact - one RENT need, one separate SALE need (rule 3 core example) ---
  const multiContact = await upsertContact(24, { name: "Rahul Sharma", phone: demoPhone(24, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const multiRentRequirement = await upsertRequirement(24, { customerContactId: multiContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocalities: [residentialRent.area], minBudget: Math.round(residentialRent.monthlyRent! * 0.7), maxBudget: residentialRent.monthlyRent!, bhk: residentialRent.bhk, lastConfirmedAt: days(-1) });
  const multiSaleRequirement = await upsertRequirement(25, { customerContactId: multiContact.id, assetClass: "RESIDENTIAL", transactionType: "SALE", preferredLocalities: [residentialSale.area], minBudget: Math.round(residentialSale.salePrice! * 0.7), maxBudget: residentialSale.salePrice!, bhk: residentialSale.bhk, lastConfirmedAt: days(-1) });

  // --- Scenario: stale requirement - unconfirmed well past requirementStaleAfterDays (default 180); must never appear in automatic matching until re-confirmed ---
  const staleContact = await upsertContact(26, { name: "Yogesh Mahesh", phone: demoPhone(26, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const staleRequirement = await upsertRequirement(26, { customerContactId: staleContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocalities: [residentialRent.area], minBudget: 1, maxBudget: residentialRent.monthlyRent!, bhk: residentialRent.bhk, lastConfirmedAt: days(-400) });

  // --- Scenario: contact already converted to a Lead (rule 4) - requirement + contact preserved, never duplicated ---
  const convertedContact = await upsertContact(27, { name: "Sandeep Dutta", phone: demoPhone(27, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const convertedRequirement = await upsertRequirement(28, { customerContactId: convertedContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocalities: [residentialRent.area], minBudget: Math.round(residentialRent.monthlyRent! * 0.7), maxBudget: residentialRent.monthlyRent!, bhk: residentialRent.bhk, lastConfirmedAt: days(-1) });
  const convertedLead = await prisma.lead.upsert({
    where: { id: demoId("dp-lead", 1) },
    update: {},
    create: {
      id: demoId("dp-lead", 1), organizationId, leadCode: demoCode("DPLEAD", 1), clientName: convertedContact.name, phone: convertedContact.phone,
      source: "MANUAL", assetClass: "RESIDENTIAL", transactionType: "RENT", requirementType: "RENT", preferredLocation: residentialRent.area,
      minBudget: convertedRequirement.minBudget ?? 0, maxBudget: convertedRequirement.maxBudget ?? 0, preferredBhk: convertedRequirement.bhk,
      customerContactId: convertedContact.id, status: "CONTACTED", priority: "WARM",
    },
  });
  await prisma.customerRequirement.update({ where: { id: convertedRequirement.id }, data: { convertedLeadId: convertedLead.id } });

  // --- Recommendation lifecycle scenarios: property-already-sent history, one prepared-but-unsent, one interested response, one rejected response ---
  const alreadySentRec = await upsertRecommendation("dp-rec", 1, { organizationId, propertyId: residentialRent.id, customerContact: exactContact, requirement: exactRequirement, property: residentialRent, status: "SENT", preparedAt: days(-4), sentAt: days(-4) });
  await prisma.customerContact.update({ where: { id: exactContact.id }, data: { lastContactedAt: days(-4), lastPropertySentAt: days(-4) } });

  const preparedRec = await upsertRecommendation("dp-rec", 2, { organizationId, propertyId: residentialSale.id, customerContact: multiContact, requirement: multiSaleRequirement, property: residentialSale, status: "PREPARED", preparedAt: days(-1) });

  const interestedRec = await upsertRecommendation("dp-rec", 3, { organizationId, propertyId: residentialRent.id, customerContact: stretchContact, requirement: stretchRequirement, property: residentialRent, status: "RESPONDED", preparedAt: days(-2), sentAt: days(-2), responseOutcome: "INTERESTED", respondedAt: days(-1), respondedById: actor.id });

  const rejectedContact = await upsertContact(29, { name: "Renu Bhalla", phone: demoPhone(29, 11), source: "MANUAL", status: "ACTIVE", doNotContact: false, whatsAppOptOut: false, createdById: actor.id });
  const rejectedRequirement = await upsertRequirement(30, { customerContactId: rejectedContact.id, assetClass: "RESIDENTIAL", transactionType: "RENT", preferredLocalities: [residentialRent.area], minBudget: Math.round(residentialRent.monthlyRent! * 0.7), maxBudget: residentialRent.monthlyRent!, bhk: residentialRent.bhk, lastConfirmedAt: days(-1) });
  const rejectedRec = await upsertRecommendation("dp-rec", 4, { organizationId, propertyId: residentialRent.id, customerContact: rejectedContact, requirement: rejectedRequirement, property: residentialRent, status: "RESPONDED", preparedAt: days(-3), sentAt: days(-3), responseOutcome: "NOT_INTERESTED", respondedAt: days(-2), respondedById: actor.id });

  // --- Pending recommendation for the EXACT scenario itself, run through the real engine so its tier is genuinely computed, not asserted ---
  const exactNormalized = normalizeCustomerRequirement(exactRequirement, exactContact, false);
  const exactScored = scoreDemandCandidate(residentialRent, exactNormalized);
  const exactPendingRec = exactScored ? await upsertRecommendation("dp-rec", 5, { organizationId, propertyId: residentialSale.id, customerContact: exactContact, requirement: exactRequirement, property: residentialSale, status: "PENDING", tierOverride: exactScored.tier, scoreOverride: exactScored.score, reasonsOverride: exactScored.reasons }) : null;

  contactIds.push(
    { id: exactContact.id, requirementIds: [exactRequirement.id] },
    { id: stretchContact.id, requirementIds: [stretchRequirement.id] },
    { id: noMatchContact.id, requirementIds: [noMatchRequirement.id] },
    { id: dncContact.id, requirementIds: [dncRequirement.id] },
    { id: optOutContact.id, requirementIds: [optOutRequirement.id] },
    { id: multiContact.id, requirementIds: [multiRentRequirement.id, multiSaleRequirement.id] },
    { id: staleContact.id, requirementIds: [staleRequirement.id] },
    { id: convertedContact.id, requirementIds: [convertedRequirement.id] },
    { id: rejectedContact.id, requirementIds: [rejectedRequirement.id] }
  );
  // Every upsertRequirement() call above must have its id collected here -
  // 4 of these (noMatch/dnc/optOut/stale) were previously created in the
  // database but never pushed into `requirements`, so this function
  // under-reported 24 when 28 rows (DEMO_SEED_PLAN.demandPoolRequirements)
  // genuinely existed - a self-verification bug, not a creation bug (see
  // scripts/seed-demo.ts's demandPoolExpectations check).
  requirementIds.push(
    exactRequirement.id, stretchRequirement.id, noMatchRequirement.id, dncRequirement.id, optOutRequirement.id,
    multiRentRequirement.id, multiSaleRequirement.id, staleRequirement.id, convertedRequirement.id, rejectedRequirement.id
  );
  recommendationIds.push(alreadySentRec.id, preparedRec.id, interestedRec.id, rejectedRec.id, ...(exactPendingRec ? [exactPendingRec.id] : []));

  return { contacts: contactIds, requirements: requirementIds, recommendations: recommendationIds };
}

async function upsertContact(index: number, data: { name: string; phone: string; source: string; status: string; doNotContact: boolean; whatsAppOptOut: boolean; createdById: string }) {
  const id = demoId("dp-contact", index);
  const normalizedPhone = data.phone.replace(/[^\d]/g, "");
  const payload = {
    organizationId: DEMO_ORGANIZATION_ID, name: data.name, phone: data.phone, normalizedPhone,
    source: data.source as never, status: data.status as never, doNotContact: data.doNotContact, whatsAppOptOut: data.whatsAppOptOut,
    tags: "[]", createdById: data.createdById,
  };
  return prisma.customerContact.upsert({ where: { id }, update: payload, create: { id, ...payload } });
}

async function upsertRequirement(index: number, data: {
  customerContactId: string; assetClass: string; transactionType: string; preferredLocalities: string[];
  minBudget: number; maxBudget: number; bhk: number | null; furnishing?: string; lastConfirmedAt: Date;
}) {
  const id = demoId("dp-req", index);
  const payload = {
    organizationId: DEMO_ORGANIZATION_ID, customerContactId: data.customerContactId, assetClass: data.assetClass as never, transactionType: data.transactionType as never,
    preferredLocalities: JSON.stringify(data.preferredLocalities), minBudget: data.minBudget, maxBudget: data.maxBudget, bhk: data.bhk,
    furnishing: (data.furnishing as never) ?? null, active: true, priority: "MEDIUM" as const, lastConfirmedAt: data.lastConfirmedAt,
  };
  return prisma.customerRequirement.upsert({ where: { id }, update: payload, create: { id, ...payload } });
}

async function upsertRecommendation(prefix: string, index: number, opts: {
  organizationId: string; propertyId: string; customerContact: { id: string }; requirement: { id: string }; property: Property;
  status: string; preparedAt?: Date; sentAt?: Date; responseOutcome?: string; respondedAt?: Date; respondedById?: string;
  tierOverride?: string; scoreOverride?: number; reasonsOverride?: Array<{ matched: boolean; detail: string }>;
}) {
  const id = demoId(prefix, index);
  const requirementNormalized: Pick<NormalizedRequirement, "source" | "candidateId"> = { source: "CONTACT", candidateId: opts.customerContact.id };
  const tier = opts.tierOverride ?? "STRONG";
  const score = opts.scoreOverride ?? 75;
  const reasons = opts.reasonsOverride ? opts.reasonsOverride.map((r) => `${r.matched ? "✓" : "⚠"} ${r.detail}`) : ["Deterministic demo recommendation - no live matching run required for this scenario."];
  const payload = {
    organizationId: opts.organizationId, propertyId: opts.propertyId, source: "CONTACT" as const, candidateKey: candidateKeyFor(requirementNormalized),
    customerContactId: opts.customerContact.id, requirementId: opts.requirement.id, tier: tier as never, score, reasons: JSON.stringify(reasons),
    status: opts.status as never, preparedAt: opts.preparedAt ?? null, sentAt: opts.sentAt ?? null, channel: opts.sentAt || opts.preparedAt ? "WHATSAPP_CLICK_TO_CHAT" : null,
    responseOutcome: (opts.responseOutcome as never) ?? null, respondedAt: opts.respondedAt ?? null, respondedById: opts.respondedById ?? null,
  };
  return prisma.propertyRecommendation.upsert({ where: { id }, update: payload, create: { id, ...payload } });
}

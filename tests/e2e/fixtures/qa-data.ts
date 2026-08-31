/**
 * Reads the deterministic records tests/e2e/setup/seed-qa-workflow.ts
 * creates, by their known clientName/title (never by array index or count),
 * so specs stay correct if the seed script's creation order ever changes.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getQaLeadId(clientName: string): Promise<string> {
  const lead = await prisma.lead.findFirstOrThrow({ where: { clientName } });
  return lead.id;
}

export async function getQaPropertyId(title: string): Promise<string> {
  const property = await prisma.property.findFirstOrThrow({ where: { title } });
  return property.id;
}

export async function getQaCatalogueToken(leadClientName: string): Promise<string> {
  const share = await prisma.catalogueShare.findFirstOrThrow({ where: { lead: { clientName: leadClientName } } });
  return share.token;
}

export async function getQaVisitId(leadClientName: string): Promise<string> {
  const visit = await prisma.visit.findFirstOrThrow({ where: { lead: { clientName: leadClientName } } });
  return visit.id;
}

export async function getQaDealId(leadClientName: string): Promise<string> {
  const deal = await prisma.deal.findFirstOrThrow({ where: { lead: { clientName: leadClientName } } });
  return deal.id;
}

export const QA_LEAD_NAMES = {
  new: "QA Lead - New Requirement",
  pendingOutcome: "QA Lead - Pending Visit Outcome",
  likedNoVisit: "QA Lead - Liked, No Visit Planned",
  unsharedMatch: "QA Lead - Valid Unshared Match",
  noMatches: "QA Lead - Zero Matches",
  closedWon: "QA Lead - Closed Won",
  multiVisit: "QA Lead - Multi-Property Visit",
  publicCatalogue: "QA Lead - Public Catalogue Source",
  visitOutcome: "QA Lead - Visit Outcome Workflow",
  dealWorkflow: "QA Lead - Deal Workflow",
} as const;

export const QA_PROPERTY_TITLES = {
  A: "QA Property A - Rohini 2BHK",
  B: "QA Property B - Dwarka 3BHK",
  C: "QA Property C - Rohini 2BHK",
  D: "QA Property D - Pitampura 1BHK (Public)",
  E: "QA Property E - Deal Target",
} as const;

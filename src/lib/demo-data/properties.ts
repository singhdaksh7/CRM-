import type { Owner, Prisma, Property, PropertyType, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, demoCode, demoPhone, AREAS, AREA_COORDS, AMENITIES_POOL, RENT_BUDGET_TIERS, DEMO_ORGANIZATION_ID } from "./constants";
import { ensureDemoPropertyAssets } from "./assets";

export const PROPERTY_COUNT = 100;

const TYPE_WEIGHTS: [PropertyType, number][] = [
  ["APARTMENT", 40], ["BUILDER_FLOOR", 20], ["INDEPENDENT_HOUSE", 15], ["VILLA", 8], ["COMMERCIAL_OFFICE", 9], ["COMMERCIAL_SHOP", 8],
];
/**
 * PropertyStatus has no "Under Negotiation" value (only AVAILABLE, RESERVED,
 * RENTED, SOLD, INACTIVE) - RESERVED is the closest existing status and is
 * used for both "Reserved" and "Under Negotiation" from the task spec,
 * distinguished only by a note on the property. See Known Limitations.
 */
const STATUS_WEIGHTS: [Property["status"], number][] = [
  ["AVAILABLE", 55], ["RESERVED", 20], ["RENTED", 12], ["SOLD", 8], ["INACTIVE", 5],
];
const FURNISHING: Property["furnishing"][] = ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"];
const FACINGS: NonNullable<Property["facing"]>[] = ["NORTH", "SOUTH", "EAST", "WEST", "NORTH_EAST", "NORTH_WEST", "SOUTH_EAST", "SOUTH_WEST"];
const TENANT_PREFS: NonNullable<Property["tenantPreference"]>[] = ["FAMILY", "BACHELOR_MALE", "BACHELOR_FEMALE", "COMPANY", "ANY"];

const TITLE_ADJECTIVES = ["Spacious", "Modern", "Cozy", "Elegant", "Premium", "Luxury", "Well-Ventilated", "Sunlit", "Newly Renovated", "Compact"];

/** Deterministic scenario slots, exported so verify/dry-run code can reference the same indices without duplicating magic numbers. */
export const PROPERTY_SCENARIO_INDEX = { noPhotos: 7, wellPhotographed: 13, staleInactive: 21, noOwner: 29 } as const;

/**
 * "1 RK" and "Warehouse" from the task's mix list aren't distinct
 * PropertyType/bhk values in the schema - a 1 RK is represented as
 * bhk=1 APARTMENT and a Warehouse as a COMMERCIAL_SHOP, distinguished only
 * in the display label (title/description), same pattern as the
 * Under-Negotiation/PropertyStatus mapping documented below.
 */
function displayLabel(rng: Rng, type: PropertyType, bhk: number): string {
  if (type === "APARTMENT" && bhk === 1 && rng.bool(0.35)) return "1 RK";
  if (type === "COMMERCIAL_SHOP" && rng.bool(0.4)) return "Warehouse";
  if (type === "COMMERCIAL_SHOP") return "Shop";
  if (type === "COMMERCIAL_OFFICE") return "Office";
  return type === "APARTMENT" ? `${bhk} BHK Apartment` : `${bhk} BHK ${type.replace(/_/g, " ")}`;
}

function titleFor(rng: Rng, label: string, area: string): string {
  const adj = rng.pick(TITLE_ADJECTIVES);
  return `${adj} ${label} in ${area}`;
}

function descriptionFor(rng: Rng, label: string, area: string, listingType: "RENT" | "SALE"): string {
  const adj = rng.pick(TITLE_ADJECTIVES).toLowerCase();
  const usage = listingType === "RENT" ? "families or working professionals" : "end-use or investment";
  return `A ${adj} ${label.toLowerCase()} located in the heart of ${area}, Delhi. Close to markets, schools, and metro connectivity. Ideal for ${usage}. Well-maintained with easy access to main roads and public transport.`;
}

export interface DemoPropertySet {
  all: Property[];
  available: Property[];
  noPhotosScenarioId: string;
  wellPhotographedScenarioId: string;
  staleInactiveScenarioId: string;
  noOwnerScenarioId: string;
}

/**
 * Pure - no I/O. Builds the exact create-input for property #i, given the
 * same rng stream position, owners pool, and employees the real seed uses.
 * Split out from createDemoProperties() so scripts/seed-demo-dry-run.ts can
 * project what would be inserted (including running the real matching
 * engine against it) WITHOUT calling prisma.property.create - the dry run
 * passes `owners: []`, which this treats the same as the noOwner scenario
 * (a graceful degradation, not a crash on an empty array).
 */
export function buildPropertyData(
  rng: Rng,
  i: number,
  owners: Owner[],
  employees: { admin: User; dataManagers: User[] },
  assetsByType: Record<PropertyType, string[]>
): Prisma.PropertyUncheckedCreateInput {
  const creators = [employees.admin, ...employees.dataManagers];
  const type = rng.weightedPick(TYPE_WEIGHTS);
  const isCommercial = type === "COMMERCIAL_SHOP" || type === "COMMERCIAL_OFFICE";
  const isRent = rng.bool(0.6);
  const area = AREAS[(i - 1) % AREAS.length];
  const bhk = isCommercial ? 0 : rng.int(1, 4);
  const bathrooms = isCommercial ? 1 : Math.max(1, bhk - rng.int(0, 1));
  const builtUp = isCommercial ? rng.int(300, 2500) : 450 + bhk * 250 + rng.int(0, 200);
  const coords = AREA_COORDS[area];
  const label = displayLabel(rng, type, bhk);

  const isNoPhotosScenario = i === PROPERTY_SCENARIO_INDEX.noPhotos;
  const isWellPhotographedScenario = i === PROPERTY_SCENARIO_INDEX.wellPhotographed;
  const isStaleInactiveScenario = i === PROPERTY_SCENARIO_INDEX.staleInactive;
  const isNoOwnerScenario = i === PROPERTY_SCENARIO_INDEX.noOwner || owners.length === 0;

  // notifyPropertiesMissingPhotos only fires for AVAILABLE listings - force
  // that status here rather than leaving it to the weighted random pick.
  const status: Property["status"] = isNoPhotosScenario ? "AVAILABLE" : isStaleInactiveScenario ? "INACTIVE" : rng.weightedPick(STATUS_WEIGHTS);

  const imagePool = assetsByType[type];
  const imageCount = isNoPhotosScenario ? 0 : isWellPhotographedScenario ? 6 : rng.int(1, 3);
  const images: string[] = [];
  for (let k = 0; k < imageCount; k++) images.push(imagePool[k % imagePool.length]);

  const owner = isNoOwnerScenario ? null : owners[(i * 3 + 7) % owners.length];
  const creator = rng.pick(creators);

  const data: Prisma.PropertyUncheckedCreateInput = {
    id: demoId("prop", i),
    organizationId: DEMO_ORGANIZATION_ID,
    propertyCode: demoCode("PROP", i),
    title: titleFor(rng, label, area),
    propertyType: type,
    listingType: isRent ? "RENT" : "SALE",
    status,
    description: descriptionFor(rng, label, area, isRent ? "RENT" : "SALE"),
    city: "Delhi",
    area,
    address: `${100 + i} ${area} Extension, New Delhi`,
    landmark: rng.bool(0.7) ? `Near ${area} Metro Station` : null,
    latitude: coords.lat + rng.float(-0.01, 0.01, 5),
    longitude: coords.lng + rng.float(-0.01, 0.01, 5),
    pincode: `1100${rng.int(10, 99)}`,
    negotiable: rng.bool(0.5),
    bhk,
    bathrooms,
    balconies: isCommercial ? 0 : rng.int(0, 3),
    furnishing: rng.pick(FURNISHING),
    floorNumber: rng.int(0, 12),
    totalFloors: rng.int(4, 15),
    propertyAgeYears: rng.int(0, 20),
    builtUpAreaSqft: builtUp,
    carpetAreaSqft: Math.round(builtUp * 0.85),
    facing: rng.pick(FACINGS),
    parkingAvailable: rng.bool(0.6),
    tenantPreference: isRent && !isCommercial ? rng.pick(TENANT_PREFS) : null,
    availableFrom: isRent ? rng.daysFromNow(rng.int(-10, 60)) : null,
    amenities: JSON.stringify(rng.pickMany(AMENITIES_POOL, rng.int(2, 6))),
    images: JSON.stringify(images),
    coverImage: images[0] ?? null,
    videoUrl: null,
    virtualTourUrl: null,
    floorPlanImage: null,
    ownerName: owner?.name ?? "Owner details pending",
    ownerPhone: owner?.phone ?? demoPhone(i, 700),
    ownerAlternatePhone: owner?.alternatePhone ?? null,
    ownerNotes: owner?.notes ?? null,
    ownerId: owner?.id ?? null,
    createdById: creator.id,
    createdAt: isStaleInactiveScenario ? rng.pastDate(60, 120) : rng.pastDate(1, 90),
    updatedAt: isStaleInactiveScenario ? rng.pastDate(45, 60) : rng.pastDate(0, 20),
  };

  if (isRent) {
    const monthlyRent = rng.pick(RENT_BUDGET_TIERS);
    data.monthlyRent = monthlyRent;
    data.securityDeposit = monthlyRent * rng.int(2, 3);
    data.maintenanceCharge = rng.bool(0.6) ? rng.int(500, 3000) : null;
    data.rentBrokerage = rng.bool(0.8) ? monthlyRent : null;
  } else {
    const pricePerSqft = rng.int(8000, 15000);
    data.pricePerSqft = pricePerSqft;
    data.salePrice = pricePerSqft * builtUp;
    data.saleBrokeragePct = rng.pick([1, 1, 1.5, 2] as const);
    data.saleBrokerageAmount = Math.round((data.salePrice as number) * ((data.saleBrokeragePct as number) / 100));
  }

  return data;
}

export async function createDemoProperties(
  rng: Rng,
  owners: Owner[],
  employees: { admin: User; dataManagers: User[] },
  count: number = PROPERTY_COUNT
): Promise<DemoPropertySet> {
  const assetsByType = ensureDemoPropertyAssets();
  const properties: Property[] = [];

  for (let i = 1; i <= count; i++) {
    const data = buildPropertyData(rng, i, owners, employees, assetsByType);
    properties.push(await prisma.property.create({ data }));
  }

  return {
    all: properties,
    available: properties.filter((p) => p.status === "AVAILABLE"),
    noPhotosScenarioId: demoId("prop", PROPERTY_SCENARIO_INDEX.noPhotos),
    wellPhotographedScenarioId: demoId("prop", PROPERTY_SCENARIO_INDEX.wellPhotographed),
    staleInactiveScenarioId: demoId("prop", PROPERTY_SCENARIO_INDEX.staleInactive),
    noOwnerScenarioId: demoId("prop", PROPERTY_SCENARIO_INDEX.noOwner),
  };
}

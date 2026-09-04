import { z } from "zod";

// Treats a blank/whitespace-only string as "not provided" before running the
// underlying check, so optional fields left empty in the Add Property form
// don't get validated as if they were filled in (e.g. an empty URL field
// failing a .url() check, or an empty phone field failing a digits check).
function optionalWhenBlank<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable().optional());
}

const optionalUrl = optionalWhenBlank(z.string().url());
const alternatePhoneField = optionalWhenBlank(z.string().regex(/^[0-9+\-\s()]{7,20}$/, "Alternate phone must contain digits only"));
const pincodeField = optionalWhenBlank(z.string().regex(/^[0-9]{6}$/, "Pincode must be a 6-digit number"));

export const propertySchema = z.object({
  title: z.string().min(3),
  propertyType: z.enum(["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE", "PG", "STUDIO", "FARM_HOUSE", "CO_LIVING", "OTHER", "OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL"]),
  listingType: z.enum(["RENT", "SALE"]),
  assetClass: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  status: z.enum(["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"]).default("AVAILABLE"),
  description: z.string().min(10),
  city: z.string().default("Delhi"),
  area: z.string().min(2),
  address: z.string().min(5),
  landmark: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  pincode: pincodeField,
  formattedAddress: z.string().optional().nullable(),
  placeId: z.string().optional().nullable(),
  monthlyRent: z.number().int().positive().optional().nullable(),
  securityDeposit: z.number().int().nonnegative().optional().nullable(),
  maintenanceCharge: z.number().int().nonnegative().optional().nullable(),
  rentBrokerage: z.number().int().nonnegative().optional().nullable(),
  salePrice: z.number().int().positive().optional().nullable(),
  pricePerSqft: z.number().int().positive().optional().nullable(),
  saleBrokeragePct: z.number().optional().nullable(),
  saleBrokerageAmount: z.number().int().nonnegative().optional().nullable(),
  negotiable: z.boolean().default(false),
  bhk: z.number().int().min(0).max(10).default(0),
  bathrooms: z.number().int().min(0).max(10).default(0),
  balconies: z.number().int().min(0).max(10).default(0),
  furnishing: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]),
  floorNumber: z.number().int().optional().nullable(),
  totalFloors: z.number().int().optional().nullable(),
  propertyAgeYears: z.number().int().optional().nullable(),
  builtUpAreaSqft: z.number().int().positive(),
  carpetAreaSqft: z.number().int().positive().optional().nullable(),
  dimension: z.string().max(80).optional().nullable(),
  possessionNotes: z.string().max(200).optional().nullable(),
  facing: z.enum(["NORTH", "SOUTH", "EAST", "WEST", "NORTH_EAST", "NORTH_WEST", "SOUTH_EAST", "SOUTH_WEST"]).optional().nullable(),
  parkingAvailable: z.boolean().default(false),
  liftAvailable: z.boolean().default(false),
  tenantPreference: z.enum(["FAMILY", "BACHELOR_MALE", "BACHELOR_FEMALE", "COMPANY", "ANY"]).optional().nullable(),
  availableFrom: z.string().optional().nullable(),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  coverImage: optionalUrl,
  videoUrl: optionalUrl,
  virtualTourUrl: optionalUrl,
  floorPlanImage: z.string().optional().nullable(),
  // Required for DIRECT inventory, absent for INDIRECT - enforced by
  // createPropertySchema's cross-field refine below, not here, so
  // propertySchema.partial() (used for PATCH) stays unaffected.
  ownerName: z.string().min(2).optional().nullable(),
  ownerPhone: z.string().min(8).optional().nullable(),
  ownerAlternatePhone: alternatePhoneField,
  ownerNotes: z.string().optional().nullable(),
  // Phase 4 - Direct vs Indirect inventory
  inventorySource: z.enum(["DIRECT", "INDIRECT"]).default("DIRECT"),
  partnerId: z.string().optional().nullable(),
  // Phase 4 - Internal Property View (never exposed on the public catalogue)
  buildingName: z.string().optional().nullable(),
  flatNumber: z.string().optional().nullable(),
  gateNumber: z.string().optional().nullable(),
  propertySource: z.string().optional().nullable(),
  keyAvailability: z.string().optional().nullable(),
  entryInstructions: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  negotiationNotes: z.string().optional().nullable(),
  hiddenRemarks: z.string().optional().nullable(),
  superAreaSqft: z.number().int().positive().optional().nullable(),
  frontageFeet: z.number().positive().optional().nullable(),
  ceilingHeightFeet: z.number().positive().optional().nullable(),
  cabins: z.number().int().nonnegative().optional().nullable(),
  workstations: z.number().int().nonnegative().optional().nullable(),
  washrooms: z.number().int().nonnegative().optional().nullable(),
  pantryAvailable: z.boolean().default(false),
  powerLoadKw: z.number().positive().optional().nullable(),
  commercialFitOut: z.enum(["FURNISHED", "SEMI_FURNISHED", "BARE_SHELL"]).optional().nullable(),
  goodsLiftAvailable: z.boolean().default(false),
  loadingAccessAvailable: z.boolean().default(false),
  roadWidthFeet: z.number().positive().optional().nullable(),
  cornerProperty: z.boolean().default(false),
  fireSafetyAvailable: z.boolean().default(false),
  suitableForTags: z.array(z.string()).default([]),
  leaseTermMonths: z.number().int().positive().optional().nullable(),
  lockInPeriodMonths: z.number().int().nonnegative().optional().nullable(),
  noticePeriodMonths: z.number().int().nonnegative().optional().nullable(),
  escalationPercentage: z.number().min(0).max(100).optional().nullable(),
  escalationIntervalMonths: z.number().int().positive().optional().nullable(),
  fitOutPeriodDays: z.number().int().nonnegative().optional().nullable(),
  camCharge: z.number().int().nonnegative().optional().nullable(),
  expectedPrice: z.number().int().positive().optional().nullable(),
  ownershipTitleNotes: z.string().max(2000).optional().nullable(),
});

/**
 * Full-create validation only (see comment above ownerName/ownerPhone) -
 * PATCH keeps using propertySchema.partial() directly since ZodEffects
 * (what .refine() returns) has no .partial() method.
 */
export const createPropertySchema = propertySchema.refine(
  (data) => data.inventorySource !== "DIRECT" || (!!data.ownerName && !!data.ownerPhone),
  { message: "Owner name and phone are required for direct inventory", path: ["ownerName"] }
).refine(
  (data) => data.inventorySource !== "INDIRECT" || !!data.partnerId,
  { message: "An inventory partner is required for indirect inventory", path: ["partnerId"] }
).refine(
  (data) => data.assetClass !== "COMMERCIAL" || ["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE"].includes(data.propertyType),
  { message: "Choose a commercial property type for commercial inventory", path: ["propertyType"] }
);

export const leadSchema = z.object({
  clientName: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().nullable().or(z.literal("")),
  source: z.enum(["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL", "OLX", "SQUARE_CONNECT", "DIRECT", "OTHER", "META"]),
  requirementType: z.enum(["RENT", "BUY"]),
  assetClass: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  transactionType: z.enum(["RENT", "SALE"]).optional(),
  preferredLocation: z.string().min(2),
  minBudget: z.number().int().nonnegative(),
  maxBudget: z.number().int().positive(),
  preferredBhk: z.number().int().min(0).max(10).optional().nullable(),
  furnishingPref: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]).optional().nullable(),
  moveInDate: z.string().optional().nullable(),
  additionalRequirements: z.string().optional().nullable(),
  commercialPropertyType: z.enum(["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE"]).optional().nullable(),
  minAreaSqft: z.number().int().positive().optional().nullable(),
  maxAreaSqft: z.number().int().positive().optional().nullable(),
  floorPreference: z.string().max(100).optional().nullable(),
  commercialFitOutPref: z.enum(["FURNISHED", "SEMI_FURNISHED", "BARE_SHELL"]).optional().nullable(),
  parkingRequired: z.boolean().optional().nullable(),
  liftRequired: z.boolean().optional().nullable(),
  suitableForTags: z.array(z.string()).default([]),
  assignedToId: z.string().optional().nullable(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"]).default("NEW"),
  priority: z.enum(["HOT", "WARM", "COLD"]).default("WARM"),
  notes: z.string().optional().nullable(),
  // Feature 3 (daily-ops hardening): reuses Deal's lostReason design -
  // structured category (same enum as Deal.lostReasonCategory) + optional
  // free-text detail, required only when the OTHER category is chosen.
  // Only meaningful when status is being set to CLOSED_LOST/NOT_INTERESTED;
  // enforced in the PATCH route, not here, since this schema is also used
  // (via .partial()) for edits that don't touch status at all.
  lostReasonCategory: z.enum(["PRICE", "LOCATION", "COMPETITION", "BUDGET", "LOAN_REJECTED", "OWNER_ISSUE", "CLIENT_NOT_INTERESTED", "OTHER"]).optional().nullable(),
  lostReasonDetail: z.string().max(500).optional().nullable(),
});

export const mockWebhookLeadSchema = z.object({
  externalLeadId: z.string(),
  clientName: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional(),
  requirementType: z.enum(["RENT", "BUY"]),
  location: z.string().min(2),
  minimumBudget: z.number().int().nonnegative(),
  maximumBudget: z.number().int().positive(),
  bhk: z.number().int().optional(),
  furnishing: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]).optional(),
  source: z.enum(["99ACRES", "MAGICBRICKS"]),
  notes: z.string().optional(),
});

export const portalConnectionSchema = z.object({
  provider: z.enum(["HOUSING", "NINETY_NINE_ACRES", "MAGICBRICKS", "OLX", "SQUARE_CONNECT", "OTHER", "META"]),
  connectionMode: z.enum(["API", "WEBHOOK", "CSV", "EMAIL", "MANUAL"]),
  displayName: z.string().max(120).optional().nullable(),
  accountReference: z.string().max(255).optional().nullable(),
  credentialReference: z.string().max(255).optional().nullable(),
  status: z.enum(["CONNECTED", "NOT_CONFIGURED", "DEGRADED", "AUTH_FAILED", "PARTNER_ACCESS_REQUIRED"]).default("NOT_CONFIGURED"),
}).refine((value) => value.status !== "CONNECTED", { message: "A provider cannot be marked connected until official credentials and contract validation are implemented", path: ["status"] });

export const visitSchema = z.object({
  leadId: z.string(),
  propertyId: z.string(),
  assignedToId: z.string().optional().nullable(),
  visitDate: z.string(),
  visitTime: z.string(),
  meetingLocation: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "IN_PROGRESS", "COMPLETED", "RESCHEDULED", "CANCELLED", "CLIENT_NO_SHOW"]).default("SCHEDULED"),
  clientFeedback: z.string().optional().nullable(),
  employeeNotes: z.string().optional().nullable(),
  outcome: z.enum(["HIGHLY_INTERESTED", "INTERESTED", "NEEDS_TIME", "NOT_INTERESTED", "WANTS_ANOTHER_PROPERTY", "READY_FOR_NEGOTIATION", "CUSTOMER_NO_SHOW", "OWNER_NO_SHOW", "NEGOTIATION_IN_PROGRESS", "SHORTLISTED", "REJECTED", "FOLLOW_UP_NEEDED"]).optional().nullable(),
  followUpAction: z.string().optional().nullable(),
  // Route-aware conflict override (Maps & Localities phase) - set only when
  // the caller has already seen a WARNING conflict response and explicitly
  // chooses to proceed anyway. See src/lib/visit-conflict.ts.
  overrideConflict: z.boolean().optional(),
  overrideReason: z.string().min(3).optional(),
  /**
   * Catalogue -> Visit workflow. The full set of properties selected for this
   * visit, in display order. `propertyId` above stays required and is treated
   * as the first/primary property, so every existing caller that sends only
   * `propertyId` keeps working and gets a single-property visit.
   */
  propertyIds: z.array(z.string()).max(20).optional(),
  catalogueShareId: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Catalogue -> Visit -> Field Executive Visit workflow
// ---------------------------------------------------------------------------

/**
 * Confirming a visit from a catalogue, with an explicit property selection.
 *
 * `propertyIds` is required (min 1) precisely so no HTTP caller can trigger
 * the "no selection = whole catalogue" server-side fallback; the Admin's
 * selection is exactly what lands in the visit.
 *
 * `requestInteractionIds` names the pending client VISIT_REQUESTED rows this
 * confirmation consumes. Optional, because an Admin may also schedule a
 * catalogue visit that no client ever requested.
 */
export const catalogueScheduleVisitSchema = z.object({
  propertyIds: z.array(z.string()).min(1).max(20),
  assignedToId: z.string().optional().nullable(),
  visitDate: z.string(),
  visitTime: z.string(),
  meetingLocation: z.string().optional().nullable(),
  requestInteractionIds: z.array(z.string()).max(50).optional(),
});

/** 1-5 stars, whole numbers only. Rejects 0, 6, and 4.5 - the value is stored, not decorative. */
export const starRatingSchema = z.number().int().min(1).max(5);

export const visitPropertyOutcomeSchema = z.object({
  status: z.enum(["PENDING", "VISITED", "SKIPPED", "CLIENT_REJECTED", "UNAVAILABLE"]),
  reactionRating: starRatingSchema.optional().nullable(),
  /** Optional free-text client feedback / executive note. Never compulsory. */
  reactionNote: z.string().max(2000).optional().nullable(),
  skipReason: z.string().max(500).optional().nullable(),
});

export const completeVisitSchema = z.object({
  overallRating: starRatingSchema.optional().nullable(),
  summary: z.string().max(2000).optional().nullable(),
  preferredPropertyIds: z.array(z.string()).max(20).optional(),
});

export const rescheduleVisitSchema = z.object({
  visitDate: z.string().optional(),
  visitTime: z.string().optional(),
  assignedToId: z.string().optional().nullable(),
});

export const cancelVisitSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const preferredPropertiesSchema = z.object({
  propertyIds: z.array(z.string()).max(20),
});

export const followUpSchema = z.object({
  leadId: z.string(),
  ownerId: z.string().optional().nullable(),
  // simplified-role-workflow: VISIT_EXPECTED/GENERAL_FOLLOW_UP were added to
  // the Prisma FollowUpType enum but this validator was never updated to
  // match - fixed here, otherwise the human-friendly Add Follow-up form
  // (spec item 4) could never actually create those two types.
  type: z.enum(["PHONE_CALL", "WHATSAPP", "PROPERTY_SHARING", "VISIT_CONFIRMATION", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_REMINDER", "VISIT_EXPECTED", "GENERAL_FOLLOW_UP"]),
  dueDate: z.string(),
  notes: z.string().optional().nullable(),
  status: z.enum(["PENDING", "COMPLETED", "RESCHEDULED", "OVERDUE", "CANCELLED"]).default("PENDING"),
});

/** An internal CRM record only; it never sends a message or initiates a call. */
export const leadInteractionSchema = z.object({
  type: z.enum(["CALL", "WHATSAPP", "MEETING", "OFFICE_VISIT", "OTHER"]),
  outcome: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const employeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  role: z.enum(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]),
  status: z.enum(["PENDING_SETUP", "ACTIVE", "INACTIVE"]).optional(),
  notes: z.string().optional().nullable(),
  maxActiveLeads: z.number().int().positive().optional(),
  isAvailable: z.boolean().optional(),
  speciality: z.enum(["RENT", "SALE", "COMMERCIAL", "RESIDENTIAL", "ALL"]).optional(),
  autoAssignEnabled: z.boolean().optional(),
  serviceAreas: z.array(z.string()).optional(),
});

/**
 * One password policy for every place a password is chosen: account setup,
 * password reset and self-service password change. Min 8 / max 128, and
 * whitespace-only is rejected (it would pass a naive length check).
 */
export const passwordPolicy = z.string().min(8, "Password must be at least 8 characters").max(128).refine((value) => value.trim().length > 0, "Password cannot be blank");

const passwordsMatch = {
  path: ["confirmPassword"],
  message: "Passwords do not match",
};

export const accountSetupPasswordSchema = z.object({
  password: passwordPolicy,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, passwordsMatch);

/** Reset submission - same policy as setup; the token travels in the URL. */
export const passwordResetSchema = accountSetupPasswordSchema;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1).max(320),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  password: passwordPolicy,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, passwordsMatch);

export const assignmentRuleSchema = z.object({
  name: z.string().min(2),
  strategy: z.enum(["ROUND_ROBIN", "LOWEST_WORKLOAD", "LOCATION_BASED", "SPECIALITY", "MANUAL_ONLY"]),
  source: z.enum(["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL"]).optional().nullable(),
  requirementType: z.enum(["RENT", "BUY"]).optional().nullable(),
  locality: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const automationRuleSchema = z.object({
  name: z.string().min(2),
  trigger: z.enum(["LEAD_CREATED", "VISIT_COMPLETED", "CATALOGUE_OPENED", "PAYMENT_RECEIVED"]),
  actionType: z.enum(["ASSIGN_EMPLOYEE", "CREATE_FOLLOW_UP", "NOTIFY_EMPLOYEE", "MARK_DEAL_CLOSED"]),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Phase 2B - WhatsApp + Catalogue
// ---------------------------------------------------------------------------

export const sendWhatsAppMessageSchema = z.object({
  content: z.string().min(1).max(4096),
  messageType: z.enum(["TEXT", "TEMPLATE"]).default("TEXT"),
  templateName: z.string().optional(),
});

export const simulateReplySchema = z.object({
  text: z.string().min(1).max(1000),
});

export const simulateStatusSchema = z.object({
  messageId: z.string(),
  status: z.enum(["DELIVERED", "READ", "FAILED"]),
});

const cataloguePropertySchema = z.object({
  propertyId: z.string(),
  sortOrder: z.number().int().default(0),
  customNote: z.string().max(300).optional().nullable(),
  internalNote: z.string().max(1000).optional().nullable(),
  priceVisible: z.boolean().default(true),
  addressVisible: z.boolean().default(false),
  brokerageVisible: z.boolean().default(false),
  isTopPick: z.boolean().default(false),
  addedManually: z.boolean().default(false),
  addedByUserId: z.string().optional().nullable(),
});

export const createCatalogueSchema = z.object({
  title: z.string().min(2).max(120),
  introMessage: z.string().max(500).optional().nullable(),
  includePrice: z.boolean().default(true),
  includeAddress: z.boolean().default(false),
  includeBrokerage: z.boolean().default(false),
  expiresAt: z.string().optional().nullable(),
  properties: z.array(cataloguePropertySchema).min(1),
});

export const updateCatalogueSchema = createCatalogueSchema.partial().extend({
  properties: z.array(cataloguePropertySchema).optional(),
});


// ---------------------------------------------------------------------------
// Phase 1 backend completion - Owner CRM / Deals / Brokerage / Payments /
// Documents / Imports
// ---------------------------------------------------------------------------

export const ownerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  alternatePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  city: z.string().default("Delhi"),
  notes: z.string().optional().nullable(),
});

export const ownerVerificationSchema = z.object({
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]),
  notes: z.string().optional().nullable(),
});

export const ownerNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});

export const dealSchema = z.object({
  dealType: z.enum(["RENTAL", "SALE"]),
  stage: z.enum(["INQUIRY", "NEGOTIATION", "AGREEMENT", "TOKEN_RECEIVED", "DOCUMENTATION", "REGISTRATION", "CLOSED_WON", "CLOSED_LOST"]).default("INQUIRY"),
  status: z.enum(["OPEN", "WON", "LOST", "CANCELLED"]).default("OPEN"),
  leadId: z.string().optional().nullable(),
  propertyId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  agreedAmount: z.number().int().positive().optional().nullable(),
  brokeragePct: z.number().min(0).max(100).optional().nullable(),
  brokerageAmount: z.number().int().nonnegative().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const dealStageUpdateSchema = z.object({
  stage: z.enum(["INQUIRY", "NEGOTIATION", "AGREEMENT", "TOKEN_RECEIVED", "DOCUMENTATION", "REGISTRATION", "CLOSED_WON", "CLOSED_LOST"]),
  notes: z.string().optional().nullable(),
  lostReason: z.string().optional().nullable(),
  lostReasonCategory: z.enum(["PRICE", "LOCATION", "COMPETITION", "BUDGET", "LOAN_REJECTED", "OWNER_ISSUE", "CLIENT_NOT_INTERESTED", "OTHER"]).optional().nullable(),
  agreedAmount: z.number().int().positive().optional(),
  closingDate: z.string().date().optional(),
  closingNotes: z.string().min(1).max(2000).optional(),
  expectedBrokerageAmount: z.number().int().nonnegative().optional(),
  kpSharePct: z.number().min(0).max(100).optional(),
  partnerSharePct: z.number().min(0).max(100).optional(),
}).superRefine((value, ctx) => {
  if (value.stage !== "CLOSED_WON") return;
  for (const key of ["agreedAmount", "closingDate", "closingNotes", "expectedBrokerageAmount", "kpSharePct"] as const) {
    if (value[key] === undefined) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required to close won` });
  }
});

export const dealOfferSchema = z.object({ amount: z.number().int().positive(), side: z.enum(["CLIENT", "OWNER", "INVENTORY_PARTNER", "INTERNAL"]), note: z.string().max(2000).optional().nullable() });
export const requirementBroadcastSchema = z.object({ leadId: z.string(), partnerIds: z.array(z.string()).min(1).max(100), status: z.enum(["DRAFT", "SHARED"]).default("DRAFT") });

export const brokerageCalculationSchema = z.object({
  type: z.enum(["RENTAL", "SALE"]),
  baseAmount: z.number().int().positive(),
  brokeragePct: z.number().min(0).max(100).optional().nullable(),
  splitPct: z.number().min(0).max(100).optional().nullable(),
  splitWithUserId: z.string().optional().nullable(),
  discountPct: z.number().min(0).max(100).optional().nullable(),
  taxPct: z.number().min(0).max(100).optional().nullable(),
  employeeIncentivePct: z.number().min(0).max(100).optional().nullable(),
  employeeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const paymentSchema = z.object({
  direction: z.enum(["RECEIVABLE", "PAYABLE"]).default("RECEIVABLE"),
  amount: z.number().int().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"]).default("CASH"),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]).default("PENDING"),
  dueDate: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  referenceNote: z.string().optional().nullable(),
});

export const documentMetadataSchema = z.object({
  entityType: z.enum(["PROPERTY", "LEAD", "OWNER", "DEAL", "PAYMENT"]),
  propertyId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  paymentId: z.string().optional().nullable(),
  fileName: z.string().min(1).max(255),
  // Exactly one of these two must be provided: `storageKey` (Phase 3B - the
  // key returned by POST /api/documents/upload-url after a real upload) or
  // `fileUrl` (legacy/external mode - a URL already hosted elsewhere).
  storageKey: z.string().min(1).optional(),
  fileUrl: z.string().min(1).optional(),
  fileType: z.string().min(1).max(100),
  fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  category: z.enum(["GENERAL", "AADHAAR", "PAN", "REGISTRY", "OWNERSHIP_PROOF", "RENT_AGREEMENT", "SALE_AGREEMENT", "BROKERAGE_AGREEMENT", "DEAL_DOCUMENT", "PAYMENT_RECEIPT", "OWNER_IDENTITY"]).default("GENERAL"),
}).refine((data) => !!data.storageKey || !!data.fileUrl, { message: "Either storageKey or fileUrl is required" });

export const importColumnMappingSchema = z.record(z.string(), z.string());

export const createImportJobSchema = z.object({
  entityType: z.enum(["PROPERTIES", "LEADS", "OWNERS", "EMPLOYEES"]),
  fileName: z.string().min(1),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
  columnMapping: importColumnMappingSchema,
});

export const catalogueInteractionSchema = z.object({
  type: z.enum(["PROPERTY_VIEWED", "INTERESTED", "NOT_INTERESTED", "VISIT_REQUESTED", "QUESTION_ASKED", "CALL_REQUESTED", "WHATSAPP_REQUESTED"]),
  propertyId: z.string().optional(),
  message: z.string().max(1000).optional(),
  clientName: z.string().max(120).optional(),
  clientPhone: z.string().max(20).optional(),
  preferredDate: z.string().max(40).optional(),
  preferredWindow: z.string().max(60).optional(),
});

// ---------------------------------------------------------------------------
// Phase 4 - Field Operations & Property Workflow
// ---------------------------------------------------------------------------

export const inventoryPartnerSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional().nullable(),
  phone: z.string().min(8),
  alternatePhone: z.string().optional().nullable(),
  localities: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  commissionSplitPct: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateInventoryPartnerSchema = inventoryPartnerSchema.partial();

export const visitFeedbackSchema = z.object({
  customerLiked: z.array(z.string()).default([]),
  customerDisliked: z.array(z.string()).default([]),
  budgetIssue: z.boolean().default(false),
  areaIssue: z.boolean().default(false),
  parkingIssue: z.boolean().default(false),
  familyRejected: z.boolean().default(false),
  ownerRejected: z.boolean().default(false),
  willVisitAgain: z.boolean().default(false),
  negotiationRequired: z.boolean().default(false),
  additionalNotes: z.string().optional().nullable(),
});

export const availabilityReportSchema = z.object({
  reason: z.enum(["ALREADY_RENTED", "ALREADY_SOLD", "PROPERTY_LOCKED", "OWNER_UNREACHABLE", "OTHER"]),
  note: z.string().max(2000).optional().nullable(),
  photoId: z.string().min(1, "A photo is required to report a property unavailable"),
  visitId: z.string().optional().nullable(),
});

export const availabilityReportReviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewNote: z.string().max(2000).optional().nullable(),
});

export const propertyReportSchema = z.object({
  type: z.enum(["WRONG_RENT", "WRONG_PHOTOS", "WRONG_AREA", "OWNER_NOT_RESPONDING", "DUPLICATE_LISTING", "PROPERTY_CLOSED", "ALREADY_RENTED", "ALREADY_SOLD", "NEEDS_NEW_PHOTOS", "REQUIRES_VERIFICATION"]),
  note: z.string().max(2000).optional().nullable(),
});

export const propertyReportResolveSchema = z.object({
  status: z.enum(["RESOLVED", "DISMISSED"]),
  resolutionNote: z.string().max(2000).optional().nullable(),
});

export const customerContactSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().min(8),
  email: z.string().email().optional().nullable().or(z.literal("")),
  source: z.enum(["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL", "OLX", "SQUARE_CONNECT", "DIRECT", "OTHER", "META"]).default("MANUAL"),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().max(60)).default([]),
  status: z.enum(["ACTIVE", "INACTIVE", "DO_NOT_CONTACT", "ARCHIVED"]).default("ACTIVE"),
  doNotContact: z.boolean().default(false),
  whatsAppOptOut: z.boolean().default(false),
});

/** Base object (no .refine()) so callers needing .partial() (PATCH endpoints) can still use it - see customerRequirementSchema below for the create-time refined version. */
export const customerRequirementBaseSchema = z.object({
  assetClass: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  transactionType: z.enum(["RENT", "SALE"]).default("RENT"),
  propertyType: z.enum(["APARTMENT", "BUILDER_FLOOR", "INDEPENDENT_HOUSE", "VILLA", "STUDIO", "FARM_HOUSE", "CO_LIVING", "PLOT", "PG", "OTHER", "OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE"]).optional().nullable(),
  commercialPropertyType: z.enum(["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE"]).optional().nullable(),
  preferredLocalities: z.array(z.string().min(2).max(120)).default([]),
  minBudget: z.number().int().nonnegative().optional().nullable(),
  maxBudget: z.number().int().positive().optional().nullable(),
  minArea: z.number().int().positive().optional().nullable(),
  maxArea: z.number().int().positive().optional().nullable(),
  bhk: z.number().int().min(0).max(10).optional().nullable(),
  floorPreference: z.string().max(100).optional().nullable(),
  furnishing: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]).optional().nullable(),
  parkingRequired: z.boolean().optional().nullable(),
  liftRequired: z.boolean().optional().nullable(),
  commercialFitOutPref: z.enum(["FURNISHED", "SEMI_FURNISHED", "BARE_SHELL"]).optional().nullable(),
  workstations: z.number().int().positive().optional().nullable(),
  cabins: z.number().int().nonnegative().optional().nullable(),
  possession: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  active: z.boolean().default(true),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const customerRequirementSchema = customerRequirementBaseSchema
  .refine((v) => !v.minBudget || !v.maxBudget || v.minBudget <= v.maxBudget, { message: "minBudget cannot exceed maxBudget", path: ["minBudget"] })
  .refine((v) => !v.minArea || !v.maxArea || v.minArea <= v.maxArea, { message: "minArea cannot exceed maxArea", path: ["minArea"] });

/** Combined contact+requirement shape for one spreadsheet row (rule 5/6) - a row always describes one customer's one requirement; multiple rows for the same phone number add additional requirements to the same (deduped) contact. Requirement fields are optional since a bare contact-only row is also valid. */
export const contactImportRowSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().min(8),
  email: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().max(4000).optional().nullable(),
  assetClass: z.enum(["RESIDENTIAL", "COMMERCIAL"]).optional(),
  transactionType: z.enum(["RENT", "SALE"]).optional(),
  bhk: z.number().int().min(0).max(10).optional(),
  commercialPropertyType: z.enum(["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE"]).optional(),
  locality: z.string().max(120).optional(),
  minBudget: z.number().int().nonnegative().optional(),
  maxBudget: z.number().int().positive().optional(),
  minArea: z.number().int().positive().optional(),
  maxArea: z.number().int().positive().optional(),
  floorPreference: z.string().max(100).optional(),
  furnishing: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]).optional(),
  parkingRequired: z.boolean().optional(),
  liftRequired: z.boolean().optional(),
  commercialFitOutPref: z.enum(["FURNISHED", "SEMI_FURNISHED", "BARE_SHELL"]).optional(),
  workstations: z.number().int().positive().optional(),
  cabins: z.number().int().nonnegative().optional(),
  possession: z.string().max(200).optional(),
  requirementNotes: z.string().max(4000).optional(),
});

export const customerResponseSchema = z.object({
  outcome: z.enum(["INTERESTED", "NOT_INTERESTED", "VISIT_REQUESTED", "BUDGET_TOO_HIGH", "LOCATION_NOT_SUITABLE", "ALREADY_PURCHASED", "DO_NOT_CONTACT"]),
});

export const catalogueExecutiveStatusSchema = z.object({
  executiveStatus: z.enum(["PENDING", "SHOWN", "CUSTOMER_LIKED", "SHORTLISTED", "REJECTED"]),
  note: z.string().max(1000).optional().nullable(),
});

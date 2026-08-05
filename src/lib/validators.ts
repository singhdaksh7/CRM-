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
  propertyType: z.enum(["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE", "PG"]),
  listingType: z.enum(["RENT", "SALE"]),
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
  bhk: z.number().int().min(0).max(10),
  bathrooms: z.number().int().min(0).max(10),
  balconies: z.number().int().min(0).max(10).default(0),
  furnishing: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]),
  floorNumber: z.number().int().optional().nullable(),
  totalFloors: z.number().int().optional().nullable(),
  propertyAgeYears: z.number().int().optional().nullable(),
  builtUpAreaSqft: z.number().int().positive(),
  carpetAreaSqft: z.number().int().positive().optional().nullable(),
  facing: z.enum(["NORTH", "SOUTH", "EAST", "WEST", "NORTH_EAST", "NORTH_WEST", "SOUTH_EAST", "SOUTH_WEST"]).optional().nullable(),
  parkingAvailable: z.boolean().default(false),
  tenantPreference: z.enum(["FAMILY", "BACHELOR_MALE", "BACHELOR_FEMALE", "COMPANY", "ANY"]).optional().nullable(),
  availableFrom: z.string().optional().nullable(),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  coverImage: optionalUrl,
  videoUrl: optionalUrl,
  virtualTourUrl: optionalUrl,
  floorPlanImage: z.string().optional().nullable(),
  ownerName: z.string().min(2),
  ownerPhone: z.string().min(8),
  ownerAlternatePhone: alternatePhoneField,
  ownerNotes: z.string().optional().nullable(),
});

export const leadSchema = z.object({
  clientName: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().nullable().or(z.literal("")),
  source: z.enum(["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL"]),
  requirementType: z.enum(["RENT", "BUY"]),
  preferredLocation: z.string().min(2),
  minBudget: z.number().int().nonnegative(),
  maxBudget: z.number().int().positive(),
  preferredBhk: z.number().int().min(0).max(10).optional().nullable(),
  furnishingPref: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]).optional().nullable(),
  moveInDate: z.string().optional().nullable(),
  additionalRequirements: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"]).default("NEW"),
  priority: z.enum(["HOT", "WARM", "COLD"]).default("WARM"),
  notes: z.string().optional().nullable(),
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

export const visitSchema = z.object({
  leadId: z.string(),
  propertyId: z.string(),
  assignedToId: z.string().optional().nullable(),
  visitDate: z.string(),
  visitTime: z.string(),
  meetingLocation: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "COMPLETED", "RESCHEDULED", "CANCELLED", "CLIENT_NO_SHOW"]).default("SCHEDULED"),
  clientFeedback: z.string().optional().nullable(),
  employeeNotes: z.string().optional().nullable(),
  outcome: z.enum(["HIGHLY_INTERESTED", "INTERESTED", "NEEDS_TIME", "NOT_INTERESTED", "WANTS_ANOTHER_PROPERTY", "READY_FOR_NEGOTIATION"]).optional().nullable(),
  followUpAction: z.string().optional().nullable(),
  // Route-aware conflict override (Maps & Localities phase) - set only when
  // the caller has already seen a WARNING conflict response and explicitly
  // chooses to proceed anyway. See src/lib/visit-conflict.ts.
  overrideConflict: z.boolean().optional(),
  overrideReason: z.string().min(3).optional(),
});

export const followUpSchema = z.object({
  leadId: z.string(),
  ownerId: z.string().optional().nullable(),
  type: z.enum(["PHONE_CALL", "WHATSAPP", "PROPERTY_SHARING", "VISIT_CONFIRMATION", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_REMINDER"]),
  dueDate: z.string(),
  notes: z.string().optional().nullable(),
  status: z.enum(["PENDING", "COMPLETED", "RESCHEDULED", "OVERDUE"]).default("PENDING"),
});

export const employeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  role: z.enum(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  notes: z.string().optional().nullable(),
  password: z.string().min(6).optional(),
  maxActiveLeads: z.number().int().positive().optional(),
  isAvailable: z.boolean().optional(),
  speciality: z.enum(["RENT", "SALE", "COMMERCIAL", "RESIDENTIAL", "ALL"]).optional(),
  autoAssignEnabled: z.boolean().optional(),
  serviceAreas: z.array(z.string()).optional(),
});

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
});

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

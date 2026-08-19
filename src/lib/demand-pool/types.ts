/** Frontend contract types for Demand Pool APIs owned by the backend agent. */

export type ContactStatus = "ACTIVE" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED";
export type AssetClass = "RESIDENTIAL" | "COMMERCIAL";
export type TransactionType = "RENT" | "SALE";
export type RequirementPriority = "LOW" | "MEDIUM" | "HIGH";
export type RecommendationTier = "EXACT" | "STRONG" | "STRETCH" | "LOW";
export type RecommendationStatus =
  | "PENDING"
  | "REVIEWED"
  | "IGNORED"
  | "PREPARED"
  | "SENT"
  | "RESPONDED"
  | "EXPIRED";
export type DemandCandidateSource = "CONTACT" | "LEAD";
export type CustomerResponseOutcome =
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "VISIT_REQUESTED"
  | "BUDGET_TOO_HIGH"
  | "LOCATION_NOT_SUITABLE"
  | "ALREADY_PURCHASED"
  | "DO_NOT_CONTACT";

export type LeadSource =
  | "ACRES_99"
  | "MAGICBRICKS"
  | "HOUSING_COM"
  | "WEBSITE"
  | "WHATSAPP"
  | "PHONE_CALL"
  | "REFERRAL"
  | "WALK_IN"
  | "MANUAL"
  | "OLX"
  | "SQUARE_CONNECT"
  | "DIRECT"
  | "OTHER";

export interface DemandMatchReason {
  label: string;
  matched: boolean;
  detail: string;
}

export interface CustomerContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  notes: string | null;
  tags: string;
  status: ContactStatus;
  doNotContact: boolean;
  whatsAppOptOut: boolean;
  lastContactedAt: string | null;
  lastPropertySentAt: string | null;
  createdAt: string;
  updatedAt: string;
  requirements?: CustomerRequirement[];
  leads?: LinkedLead[];
  recommendations?: PropertyRecommendation[];
}

export interface CustomerRequirement {
  id: string;
  customerContactId: string;
  assetClass: AssetClass;
  transactionType: TransactionType;
  propertyType: string | null;
  commercialPropertyType: string | null;
  preferredLocalities: string;
  minBudget: number | null;
  maxBudget: number | null;
  minArea: number | null;
  maxArea: number | null;
  bhk: number | null;
  floorPreference: string | null;
  furnishing: string | null;
  parkingRequired: boolean | null;
  liftRequired: boolean | null;
  commercialFitOutPref: string | null;
  workstations: number | null;
  cabins: number | null;
  possession: string | null;
  notes: string | null;
  active: boolean;
  priority: RequirementPriority;
  lastConfirmedAt: string;
  convertedLeadId: string | null;
  convertedLead?: LinkedLead | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedLead {
  id: string;
  leadCode: string;
  status: string;
  createdAt?: string;
}

export interface PropertyRecommendation {
  id: string;
  propertyId: string;
  source: DemandCandidateSource;
  candidateKey: string;
  customerContactId: string | null;
  leadId: string | null;
  requirementId: string | null;
  tier: RecommendationTier;
  score: number;
  reasons: string;
  status: RecommendationStatus;
  preparedAt: string | null;
  sentAt: string | null;
  channel: string | null;
  responseOutcome: CustomerResponseOutcome | null;
  respondedAt: string | null;
  createdAt: string;
  customerContact?: {
    id: string;
    name: string;
    phone: string;
    doNotContact: boolean;
    whatsAppOptOut: boolean;
    lastContactedAt: string | null;
    lastPropertySentAt: string | null;
  } | null;
  lead?: {
    id: string;
    clientName: string;
    phone: string;
    status: string;
    lastContactedAt: string | null;
  } | null;
  requirement?: {
    id: string;
    minBudget: number | null;
    maxBudget: number | null;
    preferredLocalities: string;
    assetClass?: AssetClass;
    transactionType?: TransactionType;
    bhk?: number | null;
  } | null;
  property?: {
    id: string;
    title: string;
    area: string;
    propertyCode: string;
    coverImage?: string | null;
    listingType?: TransactionType;
    monthlyRent?: number | null;
    salePrice?: number | null;
  } | null;
}

export interface MatchSummary {
  total: number;
  exact: number;
  strong: number;
  stretch: number;
  low: number;
}

export interface CustomerListFilters {
  q?: string;
  status?: ContactStatus | "";
  assetClass?: AssetClass | "";
  transactionType?: TransactionType | "";
  locality?: string;
  bhk?: string;
  commercialSubtype?: string;
  budgetMin?: string;
  budgetMax?: string;
  activeRequirement?: "true" | "false" | "";
  hasLead?: "true" | "false" | "";
  neverContacted?: "true" | "";
  contactedRecently?: "true" | "";
  whatsAppEligible?: "true" | "";
  doNotContact?: "true" | "";
  whatsAppOptOut?: "true" | "";
}

export interface CustomerContactInput {
  name: string;
  phone: string;
  email?: string | null;
  source?: LeadSource;
  notes?: string | null;
  tags?: string[];
  status?: ContactStatus;
  doNotContact?: boolean;
  whatsAppOptOut?: boolean;
}

export interface CustomerRequirementInput {
  assetClass: AssetClass;
  transactionType: TransactionType;
  propertyType?: string | null;
  commercialPropertyType?: string | null;
  preferredLocalities?: string[];
  minBudget?: number | null;
  maxBudget?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  bhk?: number | null;
  floorPreference?: string | null;
  furnishing?: string | null;
  parkingRequired?: boolean | null;
  liftRequired?: boolean | null;
  commercialFitOutPref?: string | null;
  workstations?: number | null;
  cabins?: number | null;
  possession?: string | null;
  notes?: string | null;
  active?: boolean;
  priority?: RequirementPriority;
}

export interface PrepareRecommendationResult {
  recommendation: PropertyRecommendation;
  message: string;
  clickToChatUrl: string | null;
  publicUrl: string;
}

export interface DemandPoolDashboardStats {
  totalCustomers: number;
  activeRequirements: number;
  residentialDemand: number;
  commercialDemand: number;
  rentDemand: number;
  saleDemand: number;
  neverContacted: number;
  newPropertiesWithMatches: number;
  highMatchOpportunities: number;
}

export interface DemandAnalyticsRow {
  locality: string;
  bhk?: number | null;
  assetClass: AssetClass;
  transactionType: TransactionType;
  commercialSubtype?: string | null;
  budgetBand?: string | null;
  demand: number;
  available: number;
}

export interface ContactImportPreviewRow {
  rowNumber: number;
  data: Record<string, unknown>;
  issues: Array<{ field: string; message: string; severity: "ERROR" | "WARNING" }>;
  duplicateClass: "NEW" | "EXISTING_CONTACT" | "EXISTING_REQUIREMENT" | "INVALID";
  action: "CREATE" | "SKIP" | "UPDATE_REQUIREMENT";
  state: "READY" | "WARNING" | "ERROR" | "DUPLICATE" | "SKIPPED";
}

export interface ContactImportResultSummary {
  newContacts: number;
  existingContacts: number;
  newRequirements: number;
  updatedRequirements: number;
  skipped: number;
  invalid: number;
}

export type RequirementLifecycleStatus = "ACTIVE" | "STALE" | "INACTIVE";

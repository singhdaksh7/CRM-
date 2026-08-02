-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DATA_MANAGER', 'FIELD_EXECUTIVE');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('RENT', 'SALE');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'SOLD', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'INDEPENDENT_HOUSE', 'VILLA', 'BUILDER_FLOOR', 'PLOT', 'COMMERCIAL_SHOP', 'COMMERCIAL_OFFICE', 'PG');

-- CreateEnum
CREATE TYPE "FurnishingStatus" AS ENUM ('FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED');

-- CreateEnum
CREATE TYPE "Facing" AS ENUM ('NORTH', 'SOUTH', 'EAST', 'WEST', 'NORTH_EAST', 'NORTH_WEST', 'SOUTH_EAST', 'SOUTH_WEST');

-- CreateEnum
CREATE TYPE "TenantPreference" AS ENUM ('FAMILY', 'BACHELOR_MALE', 'BACHELOR_FEMALE', 'COMPANY', 'ANY');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('ACRES_99', 'MAGICBRICKS', 'HOUSING_COM', 'WEBSITE', 'WHATSAPP', 'PHONE_CALL', 'REFERRAL', 'WALK_IN', 'MANUAL');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('RENT', 'BUY');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPERTIES_SHARED', 'VISIT_SCHEDULED', 'VISIT_COMPLETED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'NOT_INTERESTED', 'INVALID');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CLIENT_REACHED', 'EMPLOYEE_REACHED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED', 'CLIENT_NO_SHOW');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('HIGHLY_INTERESTED', 'INTERESTED', 'NEEDS_TIME', 'NOT_INTERESTED', 'WANTS_ANOTHER_PROPERTY', 'READY_FOR_NEGOTIATION');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('PHONE_CALL', 'WHATSAPP', 'PROPERTY_SHARING', 'VISIT_CONFIRMATION', 'NEGOTIATION', 'DOCUMENTATION', 'PAYMENT_REMINDER');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'RESCHEDULED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LEAD_RECEIVED', 'LEAD_ASSIGNED', 'LEAD_TRANSFERRED', 'PHONE_CALL_MADE', 'WHATSAPP_SENT', 'PROPERTIES_SHARED', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'VISIT_SCHEDULED', 'VISIT_COMPLETED', 'STATUS_CHANGED', 'NOTE_ADDED', 'DEAL_CLOSED', 'LEAD_CREATED', 'LEAD_UPDATED', 'WHATSAPP_CONVERSATION_CREATED', 'WHATSAPP_MESSAGE_SENT', 'WHATSAPP_MESSAGE_FAILED', 'CLIENT_REPLY_RECEIVED', 'CATALOGUE_CREATED', 'CATALOGUE_SENT', 'CATALOGUE_VIEWED', 'CATALOGUE_REVOKED', 'PROPERTY_INTERESTED', 'PROPERTY_NOT_INTERESTED', 'VISIT_REQUESTED', 'QUESTION_ASKED', 'OWNER_CREATED', 'OWNER_UPDATED', 'OWNER_VERIFIED', 'OWNER_NOTE_ADDED', 'OWNER_DOCUMENT_ADDED', 'DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'PAYMENT_RECORDED', 'PAYMENT_RECEIVED', 'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmployeeSpeciality" AS ENUM ('RENT', 'SALE', 'COMMERCIAL', 'RESIDENTIAL', 'ALL');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROUND_ROBIN', 'LOWEST_WORKLOAD', 'LOCATION_BASED', 'SPECIALITY', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_LEAD', 'LEAD_ASSIGNED', 'LEAD_TRANSFERRED', 'FOLLOW_UP_DUE', 'FOLLOW_UP_OVERDUE', 'VISIT_SCHEDULED', 'VISIT_RESCHEDULED', 'VISIT_CANCELLED', 'PROPERTY_SHARED', 'CLIENT_REPLY_RECEIVED', 'DEAL_WON', 'PAYMENT_PENDING', 'EMPLOYEE_CAPACITY_REACHED', 'CATALOGUE_VIEWED', 'PROPERTY_INTERESTED', 'PROPERTY_NOT_INTERESTED', 'VISIT_REQUESTED', 'QUESTION_ASKED', 'WHATSAPP_MESSAGE_FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppProviderName" AS ENUM ('MOCK', 'CLICK_TO_CHAT', 'META_CLOUD');

-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT', 'CATALOGUE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CatalogueInteractionType" AS ENUM ('VIEWED', 'PROPERTY_VIEWED', 'INTERESTED', 'NOT_INTERESTED', 'VISIT_REQUESTED', 'QUESTION_ASKED', 'CALL_REQUESTED', 'WHATSAPP_REQUESTED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "OwnerVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('INQUIRY', 'NEGOTIATION', 'AGREEMENT', 'TOKEN_RECEIVED', 'DOCUMENTATION', 'REGISTRATION', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BrokerageType" AS ENUM ('RENTAL', 'SALE');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('PROPERTY', 'LEAD', 'OWNER', 'DEAL', 'PAYMENT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "ImportEntityType" AS ENUM ('PROPERTIES', 'LEADS', 'OWNERS', 'EMPLOYEES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATING', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ImportRecordStatus" AS ENUM ('VALID', 'INVALID', 'IMPORTED', 'DUPLICATE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "maxActiveLeads" INTEGER NOT NULL DEFAULT 20,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "speciality" "EmployeeSpeciality" NOT NULL DEFAULT 'ALL',
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignment_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "name" TEXT NOT NULL,
    "strategy" "AssignmentStrategy" NOT NULL,
    "source" "LeadSource",
    "requirementType" "RequirementType",
    "locality" TEXT,
    "employeeId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_service_areas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "employeeId" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Delhi',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "userId" TEXT,
    "role" "Role",
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "leadId" TEXT,
    "visitId" TEXT,
    "propertyId" TEXT,
    "followUpId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "propertyCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "status" "PropertyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Delhi',
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "monthlyRent" INTEGER,
    "securityDeposit" INTEGER,
    "maintenanceCharge" INTEGER,
    "rentBrokerage" INTEGER,
    "salePrice" INTEGER,
    "pricePerSqft" INTEGER,
    "saleBrokeragePct" DOUBLE PRECISION,
    "saleBrokerageAmount" INTEGER,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "bhk" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "balconies" INTEGER NOT NULL DEFAULT 0,
    "furnishing" "FurnishingStatus" NOT NULL,
    "floorNumber" INTEGER,
    "totalFloors" INTEGER,
    "propertyAgeYears" INTEGER,
    "builtUpAreaSqft" INTEGER NOT NULL,
    "carpetAreaSqft" INTEGER,
    "facing" "Facing",
    "parkingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "tenantPreference" "TenantPreference",
    "availableFrom" TIMESTAMP(3),
    "amenities" TEXT NOT NULL DEFAULT '[]',
    "images" TEXT NOT NULL DEFAULT '[]',
    "coverImage" TEXT,
    "videoUrl" TEXT,
    "virtualTourUrl" TEXT,
    "floorPlanImage" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "ownerAlternatePhone" TEXT,
    "ownerNotes" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadCode" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" "LeadSource" NOT NULL,
    "externalLeadId" TEXT,
    "requirementType" "RequirementType" NOT NULL,
    "preferredLocation" TEXT NOT NULL,
    "minBudget" INTEGER NOT NULL,
    "maxBudget" INTEGER NOT NULL,
    "preferredBhk" INTEGER,
    "furnishingPref" "FurnishingStatus",
    "moveInDate" TIMESTAMP(3),
    "additionalRequirements" TEXT,
    "assignedToId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'WARM',
    "assignmentStrategy" "AssignmentStrategy",
    "assignmentReason" TEXT,
    "autoAssignedAt" TIMESTAMP(3),
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreExplanation" TEXT,
    "scoreUpdatedAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_score_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "priority" "LeadPriority" NOT NULL,
    "factors" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_transfers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_property_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "propertyIds" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sharedById" TEXT,
    "whatsappLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" TEXT,

    CONSTRAINT "shared_property_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitTime" TEXT NOT NULL,
    "meetingLocation" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "clientFeedback" TEXT,
    "employeeNotes" TEXT,
    "outcome" "VisitOutcome",
    "followUpAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT,
    "crmOwnerId" TEXT,
    "ownerId" TEXT,
    "type" "FollowUpType" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT,
    "crmOwnerId" TEXT,
    "dealId" TEXT,
    "actorId" TEXT,
    "type" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "provider" "WhatsAppProviderName" NOT NULL,
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "messageType" "WhatsAppMessageType" NOT NULL DEFAULT 'TEXT',
    "provider" "WhatsAppProviderName" NOT NULL,
    "providerMessageId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "templateName" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "metadata" TEXT,
    "sentByUserId" TEXT,
    "replyToMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_shares" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "token" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "introMessage" TEXT,
    "includePrice" BOOLEAN NOT NULL DEFAULT true,
    "includeAddress" BOOLEAN NOT NULL DEFAULT false,
    "includeBrokerage" BOOLEAN NOT NULL DEFAULT false,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_share_properties" (
    "id" TEXT NOT NULL,
    "catalogueShareId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customNote" TEXT,
    "priceVisible" BOOLEAN NOT NULL DEFAULT true,
    "addressVisible" BOOLEAN NOT NULL DEFAULT false,
    "brokerageVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_share_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_interactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "catalogueShareId" TEXT NOT NULL,
    "propertyId" TEXT,
    "type" "CatalogueInteractionType" NOT NULL,
    "message" TEXT,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_webhook_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "ownerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Delhi',
    "verificationStatus" "OwnerVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "dealCode" TEXT NOT NULL,
    "dealType" "BrokerageType" NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'INQUIRY',
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "leadId" TEXT,
    "propertyId" TEXT,
    "ownerId" TEXT,
    "agreedAmount" INTEGER,
    "brokeragePct" DOUBLE PRECISION,
    "brokerageAmount" INTEGER,
    "assignedToId" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brokerage_calculations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "dealId" TEXT NOT NULL,
    "type" "BrokerageType" NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "brokeragePct" DOUBLE PRECISION,
    "grossBrokerage" INTEGER NOT NULL,
    "splitPct" DOUBLE PRECISION,
    "splitWithUserId" TEXT,
    "splitAmount" INTEGER,
    "discountPct" DOUBLE PRECISION,
    "discountAmount" INTEGER,
    "taxPct" DOUBLE PRECISION,
    "taxAmount" INTEGER,
    "netBrokerage" INTEGER NOT NULL,
    "employeeIncentivePct" DOUBLE PRECISION,
    "employeeIncentiveAmount" INTEGER,
    "employeeId" TEXT,
    "notes" TEXT,
    "calculatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brokerage_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "dealId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL DEFAULT 'RECEIVABLE',
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "referenceNote" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "entityType" "DocumentEntityType" NOT NULL,
    "propertyId" TEXT,
    "leadId" TEXT,
    "ownerId" TEXT,
    "dealId" TEXT,
    "paymentId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousDocumentId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "entityType" "ImportEntityType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" TEXT NOT NULL,
    "errorLog" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_records" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ImportRecordStatus" NOT NULL,
    "rawData" TEXT NOT NULL,
    "errorMessage" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "device" TEXT,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "type" "BackupType" NOT NULL DEFAULT 'FULL',
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sizeBytes" INTEGER,
    "location" TEXT,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restore_validations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "backupRecordId" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "issuesFound" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restore_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_service_areas_employeeId_locality_key" ON "employee_service_areas"("employeeId", "locality");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_role_isRead_idx" ON "notifications"("role", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "properties_propertyCode_key" ON "properties"("propertyCode");

-- CreateIndex
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");

-- CreateIndex
CREATE INDEX "properties_organizationId_status_idx" ON "properties"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_leadCode_key" ON "leads"("leadCode");

-- CreateIndex
CREATE UNIQUE INDEX "leads_externalLeadId_key" ON "leads"("externalLeadId");

-- CreateIndex
CREATE INDEX "leads_organizationId_phone_idx" ON "leads"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "leads_organizationId_assignedToId_idx" ON "leads"("organizationId", "assignedToId");

-- CreateIndex
CREATE INDEX "activities_crmOwnerId_idx" ON "activities"("crmOwnerId");

-- CreateIndex
CREATE INDEX "activities_dealId_idx" ON "activities"("dealId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_organizationId_status_idx" ON "whatsapp_conversations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_leadId_phoneNumber_key" ON "whatsapp_conversations"("leadId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_providerMessageId_key" ON "whatsapp_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_status_idx" ON "whatsapp_messages"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_shares_token_key" ON "catalogue_shares"("token");

-- CreateIndex
CREATE INDEX "catalogue_shares_organizationId_leadId_idx" ON "catalogue_shares"("organizationId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_share_properties_catalogueShareId_propertyId_key" ON "catalogue_share_properties"("catalogueShareId", "propertyId");

-- CreateIndex
CREATE INDEX "catalogue_interactions_catalogueShareId_type_idx" ON "catalogue_interactions"("catalogueShareId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "integration_webhook_events_provider_externalEventId_key" ON "integration_webhook_events"("provider", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "owners_ownerCode_key" ON "owners"("ownerCode");

-- CreateIndex
CREATE INDEX "owners_organizationId_verificationStatus_idx" ON "owners"("organizationId", "verificationStatus");

-- CreateIndex
CREATE INDEX "owners_organizationId_phone_idx" ON "owners"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "deals_dealCode_key" ON "deals"("dealCode");

-- CreateIndex
CREATE INDEX "deals_organizationId_status_idx" ON "deals"("organizationId", "status");

-- CreateIndex
CREATE INDEX "deals_organizationId_stage_idx" ON "deals"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "deals_assignedToId_idx" ON "deals"("assignedToId");

-- CreateIndex
CREATE INDEX "deals_leadId_idx" ON "deals"("leadId");

-- CreateIndex
CREATE INDEX "deals_ownerId_idx" ON "deals"("ownerId");

-- CreateIndex
CREATE INDEX "deals_propertyId_idx" ON "deals"("propertyId");

-- CreateIndex
CREATE INDEX "brokerage_calculations_organizationId_dealId_idx" ON "brokerage_calculations"("organizationId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_organizationId_dealId_idx" ON "payments"("organizationId", "dealId");

-- CreateIndex
CREATE INDEX "payments_organizationId_status_idx" ON "payments"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "documents_previousDocumentId_key" ON "documents"("previousDocumentId");

-- CreateIndex
CREATE INDEX "documents_organizationId_entityType_idx" ON "documents"("organizationId", "entityType");

-- CreateIndex
CREATE INDEX "documents_propertyId_idx" ON "documents"("propertyId");

-- CreateIndex
CREATE INDEX "documents_leadId_idx" ON "documents"("leadId");

-- CreateIndex
CREATE INDEX "documents_ownerId_idx" ON "documents"("ownerId");

-- CreateIndex
CREATE INDEX "documents_dealId_idx" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "import_jobs_organizationId_entityType_idx" ON "import_jobs"("organizationId", "entityType");

-- CreateIndex
CREATE INDEX "import_records_importJobId_status_idx" ON "import_records"("importJobId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_userId_createdAt_idx" ON "audit_logs"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_records_organizationId_status_idx" ON "backup_records"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_service_areas" ADD CONSTRAINT "employee_service_areas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_service_areas" ADD CONSTRAINT "employee_service_areas_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_history" ADD CONSTRAINT "lead_score_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_history" ADD CONSTRAINT "lead_score_history_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_transfers" ADD CONSTRAINT "lead_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_transfers" ADD CONSTRAINT "lead_transfers_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_transfers" ADD CONSTRAINT "lead_transfers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_transfers" ADD CONSTRAINT "lead_transfers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_property_logs" ADD CONSTRAINT "shared_property_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_property_logs" ADD CONSTRAINT "shared_property_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_property_logs" ADD CONSTRAINT "shared_property_logs_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_property_logs" ADD CONSTRAINT "shared_property_logs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_crmOwnerId_fkey" FOREIGN KEY ("crmOwnerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_crmOwnerId_fkey" FOREIGN KEY ("crmOwnerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_shares" ADD CONSTRAINT "catalogue_shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_shares" ADD CONSTRAINT "catalogue_shares_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_shares" ADD CONSTRAINT "catalogue_shares_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_shares" ADD CONSTRAINT "catalogue_shares_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_share_properties" ADD CONSTRAINT "catalogue_share_properties_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_share_properties" ADD CONSTRAINT "catalogue_share_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_interactions" ADD CONSTRAINT "catalogue_interactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_interactions" ADD CONSTRAINT "catalogue_interactions_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_interactions" ADD CONSTRAINT "catalogue_interactions_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokerage_calculations" ADD CONSTRAINT "brokerage_calculations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokerage_calculations" ADD CONSTRAINT "brokerage_calculations_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokerage_calculations" ADD CONSTRAINT "brokerage_calculations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokerage_calculations" ADD CONSTRAINT "brokerage_calculations_calculatedById_fkey" FOREIGN KEY ("calculatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_previousDocumentId_fkey" FOREIGN KEY ("previousDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_validations" ADD CONSTRAINT "restore_validations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_validations" ADD CONSTRAINT "restore_validations_backupRecordId_fkey" FOREIGN KEY ("backupRecordId") REFERENCES "backup_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_validations" ADD CONSTRAINT "restore_validations_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the default organization every org-scoped row's `organizationId`
-- DEFAULT('org_default') points at. Carried over from the original SQLite
-- migration (20260801123833_phase2a_organization_and_scoping) - this
-- baseline migration's DDL is generated fresh from schema.prisma, which
-- does not capture data-seed statements, so it must be repeated here.
INSERT INTO "organizations" ("id", "name", "slug", "phone", "email", "address", "timezone", "currency", "settings", "createdAt", "updatedAt")
VALUES ('org_default', 'Delhi Broker CRM', 'delhi-broker-crm', '+919811100001', 'admin@delhibrokercrm.com', 'Delhi, India', 'Asia/Kolkata', 'INR', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

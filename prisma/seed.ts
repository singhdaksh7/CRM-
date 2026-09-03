import { PrismaClient, Role, ListingType, PropertyStatus, PropertyType, FurnishingStatus, Facing, TenantPreference, LeadSource, RequirementType, LeadStatus, LeadPriority, VisitStatus, VisitOutcome, FollowUpType, FollowUpStatus, ActivityType, DealStage, DealStatus, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recalculateLeadScore } from "../src/lib/scoring";
import { calculateBrokerage } from "../src/lib/brokerage-calc";

const prisma = new PrismaClient();

const AREAS = ["Janakpuri", "Dwarka", "Rajouri Garden", "Uttam Nagar", "Rohini", "Pitampura", "Vasant Kunj", "Saket", "Greater Kailash", "Lajpat Nagar", "Karol Bagh", "Paschim Vihar"];

const OWNER_NAMES = ["Ramesh Gupta", "Suresh Khanna", "Anita Malhotra", "Vikram Sethi", "Poonam Arora", "Deepak Chawla", "Rekha Bansal", "Ashok Bhatia", "Manju Tandon", "Rajeev Sabharwal"];

const CLIENT_NAMES = [
  "Rahul Sharma", "Priya Verma", "Amit Singh", "Neha Kapoor", "Vikas Yadav", "Pooja Mehta", "Sanjay Gupta", "Kavita Joshi", "Rohit Malhotra", "Anjali Nair",
  "Karan Chopra", "Simran Kaur", "Manoj Tiwari", "Divya Reddy", "Ajay Kumar", "Ritu Agarwal", "Naveen Bhatt", "Shweta Pandey", "Gaurav Saxena", "Meera Iyer",
  "Tarun Khanna", "Swati Bhalla", "Vivek Menon", "Nisha Rawat", "Arjun Dutta",
];

const PROPERTY_TITLES = ["Spacious", "Modern", "Cozy", "Elegant", "Premium", "Luxury", "Well-Ventilated", "Sunlit", "Newly Renovated", "Compact"];
const PROPERTY_TYPE_NAMES: Partial<Record<PropertyType, string>> = {
  APARTMENT: "Apartment",
  INDEPENDENT_HOUSE: "Independent House",
  VILLA: "Villa",
  BUILDER_FLOOR: "Builder Floor",
  PLOT: "Plot",
  COMMERCIAL_SHOP: "Commercial Shop",
  COMMERCIAL_OFFICE: "Commercial Office",
  PG: "PG",
};

const AMENITIES_POOL = ["Lift", "Power Backup", "24x7 Security", "Swimming Pool", "Gym", "Club House", "Children's Play Area", "Covered Parking", "CCTV", "Park Facing", "Modular Kitchen", "Water Storage"];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function rand(seed: number, max: number): number {
  // simple deterministic pseudo-random
  const x = Math.sin(seed * 999) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

function phoneFor(i: number): string {
  return `+9198${(10000000 + i * 137) % 100000000}`.slice(0, 13);
}

async function main() {
  const alreadySeeded = await prisma.user.findUnique({ where: { email: "admin@delhibrokercrm.com" } });
  if (alreadySeeded) {
    console.log("Database already seeded (admin@delhibrokercrm.com exists) - skipping. Run `npm run db:reset` for a clean reseed.");
    return;
  }

  console.log("Seeding database...");

  // ---------------------------------------------------------------------
  // Users / Employees
  // ---------------------------------------------------------------------
  const passwordAdmin = await bcrypt.hash("Admin@123", 10);
  const passwordKanchan = await bcrypt.hash("Kanchan@123", 10);
  const passwordSagar = await bcrypt.hash("Sagar@123", 10);
  const passwordOther = await bcrypt.hash("Employee@123", 10);

  const admin = await prisma.user.create({
    data: { name: "Abhishek Kumar", email: "admin@delhibrokercrm.com", passwordHash: passwordAdmin, phone: "+919811100001", role: Role.ADMIN },
  });
  const kanchan = await prisma.user.create({
    data: { name: "Kanchan", email: "kanchan@delhibrokercrm.com", passwordHash: passwordKanchan, phone: "+919811100002", role: Role.DATA_MANAGER, notes: "Handles property intake and lead qualification." },
  });
  const sagar = await prisma.user.create({
    data: {
      name: "Sagar", email: "sagar@delhibrokercrm.com", passwordHash: passwordSagar, phone: "+919811100003", role: Role.FIELD_EXECUTIVE,
      speciality: "ALL", maxActiveLeads: 15,
      serviceAreas: { create: [{ locality: "Janakpuri", priority: 3 }, { locality: "Dwarka", priority: 2 }, { locality: "Uttam Nagar", priority: 1 }] },
    },
  });
  const mohit = await prisma.user.create({
    data: {
      name: "Mohit Bhai", email: "mohit@delhibrokercrm.com", passwordHash: passwordOther, phone: "+919811100004", role: Role.FIELD_EXECUTIVE,
      speciality: "RENT", maxActiveLeads: 12,
      serviceAreas: { create: [{ locality: "Rajouri Garden", priority: 3 }, { locality: "Karol Bagh", priority: 2 }, { locality: "Paschim Vihar", priority: 1 }] },
    },
  });
  const nonu = await prisma.user.create({
    data: {
      name: "Nonu Bhai", email: "nonu@delhibrokercrm.com", passwordHash: passwordOther, phone: "+919811100005", role: Role.FIELD_EXECUTIVE,
      speciality: "SALE", maxActiveLeads: 12,
      serviceAreas: { create: [{ locality: "Rohini", priority: 4 }, { locality: "Pitampura", priority: 3 }, { locality: "Saket", priority: 2 }, { locality: "Vasant Kunj", priority: 1 }, { locality: "Greater Kailash", priority: 1 }, { locality: "Lajpat Nagar", priority: 1 }] },
    },
  });
  const fieldExecs = [sagar, mohit, nonu];

  // ---------------------------------------------------------------------
  // Automatic lead-assignment rules (Phase 2A) - demonstrates all strategies
  // ---------------------------------------------------------------------
  await prisma.leadAssignmentRule.createMany({
    data: [
      { name: "Referral leads go to Kanchan for manual triage", strategy: "MANUAL_ONLY", source: "REFERRAL", priority: 20, isActive: true },
      { name: "Rent leads by speciality", strategy: "SPECIALITY", requirementType: "RENT", priority: 10, isActive: true },
      { name: "Location-based fallback", strategy: "LOCATION_BASED", priority: 5, isActive: true },
    ],
  });

  // ---------------------------------------------------------------------
  // Properties (30)
  // ---------------------------------------------------------------------
  const properties = [];
  for (let i = 0; i < 30; i++) {
    const isRent = i % 3 !== 0; // ~2/3 rent, 1/3 sale
    const bhk = 1 + (i % 4);
    const area = pick(AREAS, i);
    const propertyType = i % 9 === 0 ? PropertyType.BUILDER_FLOOR : i % 7 === 0 ? PropertyType.INDEPENDENT_HOUSE : i % 11 === 0 ? PropertyType.VILLA : PropertyType.APARTMENT;
    const furnishing = i % 3 === 0 ? FurnishingStatus.FURNISHED : i % 3 === 1 ? FurnishingStatus.SEMI_FURNISHED : FurnishingStatus.UNFURNISHED;
    const statusPool: PropertyStatus[] = [PropertyStatus.AVAILABLE, PropertyStatus.AVAILABLE, PropertyStatus.AVAILABLE, PropertyStatus.RESERVED, PropertyStatus.RENTED, PropertyStatus.SOLD, PropertyStatus.INACTIVE];
    const status = pick(statusPool, i + 3);
    const builtUp = 450 + bhk * 250 + rand(i, 200);
    const baseRentPerBhk = 9000;

    const data: Prisma.PropertyUncheckedCreateInput = {
      propertyCode: `PROP-${String(i + 1).padStart(4, "0")}`,
      title: `${pick(PROPERTY_TITLES, i)} ${bhk} BHK ${PROPERTY_TYPE_NAMES[propertyType] ?? propertyType} in ${area}`,
      propertyType,
      listingType: isRent ? ListingType.RENT : ListingType.SALE,
      status,
      description: `A ${pick(PROPERTY_TITLES, i).toLowerCase()} ${bhk} BHK ${(PROPERTY_TYPE_NAMES[propertyType] ?? propertyType).toLowerCase()} located in the heart of ${area}, Delhi. Close to markets, schools, and metro connectivity. Ideal for ${isRent ? "families or working professionals" : "end-use or investment"}.`,
      city: "Delhi",
      area,
      address: `${100 + i} ${area} Extension, New Delhi`,
      landmark: `Near ${area} Metro Station`,
      latitude: 28.55 + rand(i, 40) / 1000,
      longitude: 77.05 + rand(i + 5, 40) / 1000,
      negotiable: i % 2 === 0,
      bhk,
      bathrooms: Math.max(1, bhk - 1),
      balconies: i % 4,
      furnishing,
      floorNumber: 1 + (i % 12),
      totalFloors: 4 + (i % 10),
      propertyAgeYears: i % 15,
      builtUpAreaSqft: builtUp,
      carpetAreaSqft: Math.round(builtUp * 0.85),
      facing: pick(Object.values(Facing), i),
      parkingAvailable: i % 2 === 0,
      tenantPreference: isRent ? pick(Object.values(TenantPreference), i) : null,
      availableFrom: new Date(Date.now() + (i % 5) * 7 * 24 * 3600 * 1000),
      amenities: JSON.stringify(AMENITIES_POOL.filter((_, idx) => (idx + i) % 3 === 0)),
      images: JSON.stringify([
        `https://images.unsplash.com/photo-${1560184000000 + (i % 20) * 1000}?auto=format&fit=crop&w=1200&q=60`,
      ]),
      coverImage: `https://images.unsplash.com/photo-${1560184000000 + (i % 20) * 1000}?auto=format&fit=crop&w=1200&q=60`,
      videoUrl: null,
      virtualTourUrl: null,
      floorPlanImage: null,
      ownerName: pick(OWNER_NAMES, i),
      ownerPhone: phoneFor(i + 200),
      ownerAlternatePhone: i % 2 === 0 ? phoneFor(i + 400) : null,
      ownerNotes: i % 4 === 0 ? "Prefers verified tenants only." : null,
      createdById: i % 2 === 0 ? kanchan.id : admin.id,
    };

    if (isRent) {
      data.monthlyRent = baseRentPerBhk * bhk + rand(i, 5000);
      data.securityDeposit = data.monthlyRent * 2;
      data.maintenanceCharge = 500 + bhk * 300;
      data.rentBrokerage = data.monthlyRent; // 1 month brokerage, common convention
    } else {
      data.pricePerSqft = 9000 + rand(i, 6000);
      data.salePrice = data.pricePerSqft * builtUp;
      data.saleBrokeragePct = 1;
      data.saleBrokerageAmount = Math.round(data.salePrice * 0.01);
    }

    properties.push(await prisma.property.create({ data }));
  }

  const availableProperties = properties.filter((p) => p.status === PropertyStatus.AVAILABLE);

  // ---------------------------------------------------------------------
  // Leads (25)
  // ---------------------------------------------------------------------
  const sources = Object.values(LeadSource);
  const statuses: LeadStatus[] = [
    LeadStatus.NEW, LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPERTIES_SHARED,
    LeadStatus.VISIT_SCHEDULED, LeadStatus.VISIT_COMPLETED, LeadStatus.NEGOTIATION, LeadStatus.CLOSED_WON,
    LeadStatus.CLOSED_LOST, LeadStatus.NOT_INTERESTED,
  ];
  const priorities = Object.values(LeadPriority);

  const leads = [];
  for (let i = 0; i < 25; i++) {
    const isRent = i % 3 !== 1;
    const area = pick(AREAS, i + 2);
    const bhk = 1 + (i % 4);
    const minBudget = isRent ? 12000 + (i % 5) * 4000 : 4000000 + (i % 6) * 1500000;
    const maxBudget = isRent ? minBudget + 8000 : minBudget + 2000000;
    const source = pick(sources, i);
    const status = i < 3 ? LeadStatus.NEW : pick(statuses, i); // guarantee a few fresh "new" leads
    const assignUnassigned = i % 6 === 0; // some unassigned
    const assignedTo = assignUnassigned ? null : pick(fieldExecs, i);
    const priority = pick(priorities, i);
    const createdDaysAgo = i % 20;

    const lead = await prisma.lead.create({
      data: {
        leadCode: `LEAD-${String(i + 1).padStart(4, "0")}`,
        clientName: pick(CLIENT_NAMES, i),
        phone: phoneFor(i),
        email: `${pick(CLIENT_NAMES, i).toLowerCase().replace(/\s+/g, ".")}@example.com`,
        source,
        requirementType: isRent ? RequirementType.RENT : RequirementType.BUY,
        preferredLocation: area,
        minBudget,
        maxBudget,
        preferredBhk: bhk,
        furnishingPref: pick(Object.values(FurnishingStatus), i),
        moveInDate: new Date(Date.now() + (i % 10) * 5 * 24 * 3600 * 1000),
        additionalRequirements: i % 3 === 0 ? "Needs property near metro station" : i % 3 === 1 ? "Prefers ground floor or with lift" : null,
        assignedToId: assignedTo?.id ?? null,
        assignmentReason: assignedTo ? `Manually assigned to ${assignedTo.name} during initial data setup.` : null,
        status,
        priority,
        lastContactedAt: status === LeadStatus.NEW ? null : new Date(Date.now() - (i % 5) * 24 * 3600 * 1000),
        nextFollowUpAt: ([LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST, LeadStatus.NOT_INTERESTED, LeadStatus.INVALID] as LeadStatus[]).includes(status)
          ? null
          : new Date(Date.now() + ((i % 7) - 2) * 24 * 3600 * 1000),
        notes: i % 4 === 0 ? "Client is flexible on move-in date." : null,
        externalLeadId: source === LeadSource.ACRES_99 ? `99A-${10000 + i}` : source === LeadSource.MAGICBRICKS ? `MB-${20000 + i}` : null,
        createdAt: new Date(Date.now() - createdDaysAgo * 24 * 3600 * 1000),
      },
    });
    leads.push(lead);

    await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: ActivityType.LEAD_RECEIVED,
        description: `Lead received via ${source.replace(/_/g, " ")}`,
        createdAt: lead.createdAt,
      },
    });
    if (assignedTo) {
      await prisma.activity.create({
        data: { leadId: lead.id, type: ActivityType.LEAD_ASSIGNED, description: `Assigned to ${assignedTo.name}`, actorId: kanchan.id },
      });
    }
    if (status !== LeadStatus.NEW) {
      await prisma.activity.create({
        data: { leadId: lead.id, type: ActivityType.STATUS_CHANGED, description: `Status changed to ${status.replace(/_/g, " ")}`, actorId: assignedTo?.id ?? kanchan.id },
      });
    }
  }

  // ---------------------------------------------------------------------
  // Shared property logs for a handful of leads
  // ---------------------------------------------------------------------
  for (let i = 0; i < 8; i++) {
    const lead = leads[i];
    const matchingProps = availableProperties.slice(i, i + 2);
    if (matchingProps.length === 0) continue;
    const message = `Hello ${lead.clientName}, we have shortlisted ${matchingProps.length} properties matching your requirement in ${lead.preferredLocation}.`;
    await prisma.sharedPropertyLog.create({
      data: {
        leadId: lead.id,
        propertyIds: JSON.stringify(matchingProps.map((p) => p.id)),
        message,
        sharedById: kanchan.id,
        whatsappLink: `https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
      },
    });
    await prisma.activity.create({
      data: { leadId: lead.id, type: ActivityType.PROPERTIES_SHARED, description: `${matchingProps.length} properties shared via WhatsApp`, actorId: kanchan.id },
    });
  }

  // ---------------------------------------------------------------------
  // Visits (10)
  // ---------------------------------------------------------------------
  const visitStatuses = Object.values(VisitStatus);
  const visitOutcomes = Object.values(VisitOutcome);
  for (let i = 0; i < 10; i++) {
    const lead = leads[i % leads.length];
    const property = availableProperties[i % availableProperties.length];
    const exec = pick(fieldExecs, i);
    const status = pick(visitStatuses, i);
    const isCompleted = status === VisitStatus.COMPLETED;
    await prisma.visit.create({
      data: {
        leadId: lead.id,
        propertyId: property.id,
        assignedToId: exec.id,
        visitDate: new Date(Date.now() + ((i % 7) - 3) * 24 * 3600 * 1000),
        visitTime: `${10 + (i % 8)}:00`,
        meetingLocation: `${property.area} - Property Site`,
        status,
        clientFeedback: isCompleted ? "Client liked the location and layout." : null,
        employeeNotes: isCompleted ? "Discussed pricing, client to confirm in 2 days." : null,
        outcome: isCompleted ? pick(visitOutcomes, i) : null,
        followUpAction: isCompleted ? "Schedule follow-up call in 2 days" : null,
      },
    });
    await prisma.activity.create({
      data: { leadId: lead.id, type: ActivityType.VISIT_SCHEDULED, description: `Visit scheduled at ${property.title}`, actorId: exec.id },
    });
  }

  // ---------------------------------------------------------------------
  // Follow-ups (15)
  // ---------------------------------------------------------------------
  const followUpTypes = Object.values(FollowUpType);
  for (let i = 0; i < 15; i++) {
    const lead = leads[(i * 2) % leads.length];
    const owner = lead.assignedToId ? [kanchan, sagar, mohit, nonu].find((u) => u.id === lead.assignedToId) ?? kanchan : kanchan;
    const dueOffsetDays = (i % 9) - 4; // some overdue, some today, some upcoming
    const status = dueOffsetDays < 0 ? (i % 2 === 0 ? FollowUpStatus.OVERDUE : FollowUpStatus.COMPLETED) : FollowUpStatus.PENDING;
    await prisma.followUp.create({
      data: {
        leadId: lead.id,
        ownerId: owner.id,
        type: pick(followUpTypes, i),
        dueDate: new Date(Date.now() + dueOffsetDays * 24 * 3600 * 1000),
        notes: i % 3 === 0 ? "Confirm budget flexibility before next call." : null,
        status,
        completedAt: status === FollowUpStatus.COMPLETED ? new Date() : null,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Lead scoring (Phase 2A) - run the real scoring engine now that every
  // lead's visits/follow-ups/shared-property history exists, so scores and
  // priorities reflect final demo state rather than the arbitrary values
  // set above.
  // ---------------------------------------------------------------------
  for (const lead of leads) {
    await recalculateLeadScore(lead.id, "LEAD_CREATED");
  }

  // ---------------------------------------------------------------------
  // Owners (10) - link a handful of existing properties to full Owner CRM
  // records so the Owner detail view has real property/deal history.
  // ---------------------------------------------------------------------
  const owners = [];
  for (let i = 0; i < 10; i++) {
    const owner = await prisma.owner.create({
      data: {
        ownerCode: `OWN-${String(i + 1).padStart(5, "0")}`,
        name: pick(OWNER_NAMES, i),
        phone: phoneFor(i + 200),
        alternatePhone: i % 2 === 0 ? phoneFor(i + 400) : null,
        email: `${pick(OWNER_NAMES, i).toLowerCase().replace(/\s+/g, ".")}@example.com`,
        address: `${100 + i} ${pick(AREAS, i)} Extension, New Delhi`,
        city: "Delhi",
        verificationStatus: i % 3 === 0 ? "VERIFIED" : i % 3 === 1 ? "PENDING" : "UNVERIFIED",
        verifiedAt: i % 3 === 0 ? new Date() : null,
        verifiedById: i % 3 === 0 ? kanchan.id : null,
        notes: i % 4 === 0 ? "Prefers verified tenants only." : null,
        createdById: i % 2 === 0 ? kanchan.id : admin.id,
      },
    });
    owners.push(owner);
    await prisma.activity.create({
      data: { crmOwnerId: owner.id, type: ActivityType.OWNER_CREATED, description: `Owner ${owner.name} (${owner.ownerCode}) created`, actorId: admin.id },
    });

    // Link this owner to the properties that already carry their phone (same seed data), so `owner.properties` is populated.
    await prisma.property.updateMany({ where: { ownerPhone: owner.phone }, data: { ownerId: owner.id } });
  }

  // ---------------------------------------------------------------------
  // Deals (8) + Brokerage calculations + Payments - demonstrates the full
  // pipeline from INQUIRY through CLOSED_WON with a real brokerage ledger.
  // ---------------------------------------------------------------------
  const dealStages: DealStage[] = [DealStage.INQUIRY, DealStage.NEGOTIATION, DealStage.AGREEMENT, DealStage.TOKEN_RECEIVED, DealStage.CLOSED_WON, DealStage.CLOSED_WON, DealStage.CLOSED_LOST, DealStage.DOCUMENTATION];
  for (let i = 0; i < 8; i++) {
    const lead = leads[i * 3];
    const property = availableProperties[i % availableProperties.length];
    const owner = owners[i % owners.length];
    const stage = dealStages[i];
    const isSale = property.listingType === ListingType.SALE;
    const baseAmount = isSale ? property.salePrice ?? 5000000 : property.monthlyRent ?? 20000;
    const status: DealStatus = stage === "CLOSED_WON" ? "WON" : stage === "CLOSED_LOST" ? "LOST" : "OPEN";
    const assignedTo = pick(fieldExecs, i);

    const deal = await prisma.deal.create({
      data: {
        dealCode: `DEAL-${String(i + 1).padStart(5, "0")}`,
        dealType: isSale ? "SALE" : "RENTAL",
        stage,
        status,
        leadId: lead.id,
        propertyId: property.id,
        ownerId: owner.id,
        agreedAmount: baseAmount,
        assignedToId: assignedTo.id,
        expectedCloseDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        closedAt: status !== "OPEN" ? new Date() : null,
        lostReason: status === "LOST" ? "Client chose a different property closer to their office." : null,
        notes: i % 2 === 0 ? "Client is in active negotiation on final price." : null,
        createdById: kanchan.id,
      },
    });
    await prisma.activity.create({
      data: { dealId: deal.id, type: ActivityType.DEAL_CREATED, description: `Deal ${deal.dealCode} created`, actorId: kanchan.id },
    });

    if (status === "WON") {
      const brokerage = calculateBrokerage({ type: isSale ? "SALE" : "RENTAL", baseAmount, brokeragePct: isSale ? 1 : 100, taxPct: 18 });
      await prisma.brokerageCalculation.create({
        data: {
          dealId: deal.id,
          type: isSale ? "SALE" : "RENTAL",
          baseAmount,
          brokeragePct: isSale ? 1 : 100,
          grossBrokerage: brokerage.grossBrokerage,
          taxPct: 18,
          taxAmount: brokerage.taxAmount,
          netBrokerage: brokerage.netBrokerage,
          calculatedById: kanchan.id,
        },
      });
      await prisma.deal.update({ where: { id: deal.id }, data: { brokerageAmount: brokerage.netBrokerage, brokeragePct: isSale ? 1 : 100 } });
      await prisma.activity.create({
        data: { dealId: deal.id, type: ActivityType.DEAL_WON, description: `Deal ${deal.dealCode} closed won`, actorId: assignedTo.id },
      });

      // One paid, one pending payment - demonstrates partial-payment / outstanding-balance tracking.
      const half = Math.round(brokerage.netBrokerage / 2);
      await prisma.payment.create({
        data: {
          dealId: deal.id, direction: "RECEIVABLE", amount: half, method: "BANK_TRANSFER", status: "PAID",
          paidAt: new Date(), receiptNumber: `RCPT-${String(i + 1).padStart(5, "0")}`, recordedById: kanchan.id,
        },
      });
      await prisma.payment.create({
        data: {
          dealId: deal.id, direction: "RECEIVABLE", amount: brokerage.netBrokerage - half, method: "UPI", status: "PENDING",
          dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000), recordedById: kanchan.id,
        },
      });
    } else if (status === "LOST") {
      await prisma.activity.create({
        data: { dealId: deal.id, type: ActivityType.DEAL_LOST, description: `Deal ${deal.dealCode} closed lost`, actorId: assignedTo.id },
      });
    }
  }

  console.log("Seed complete:");
  console.log(`  Organization: org_default (Delhi Broker CRM)`);
  console.log(`  Users: 5 (1 admin, 1 data manager, 3 field executives with service areas + specialities)`);
  console.log(`  Properties: ${properties.length}`);
  console.log(`  Leads: ${leads.length} (scored via the lead-scoring engine)`);
  console.log(`  Visits: 10, Follow-ups: 15`);
  console.log(`  Owners: ${owners.length}, Deals: 8 (2 won with brokerage + payments, 1 lost)`);
  console.log(`  Lead assignment rules: 3 (manual-only referrals, speciality-based rent, location-based fallback)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { describe, it, expect, vi, beforeEach } from "vitest";

const catalogueShareFindUnique = vi.fn();
const catalogueShareUpdate = vi.fn();
const catalogueShareProperty = vi.fn();
const catalogueInteractionCreate = vi.fn();
const catalogueInteractionFindMany = vi.fn();
const catalogueInteractionFindFirst = vi.fn();
const propertyFindUnique = vi.fn();
const followUpCreate = vi.fn();
const transaction = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    catalogueShare: {
      findUnique: (...args: unknown[]) => catalogueShareFindUnique(...args),
      update: (...args: unknown[]) => catalogueShareUpdate(...args),
    },
    catalogueShareProperty: {
      findUnique: (...args: unknown[]) => catalogueShareProperty(...args),
    },
    catalogueInteraction: {
      create: (...args: unknown[]) => catalogueInteractionCreate(...args),
      findMany: (...args: unknown[]) => catalogueInteractionFindMany(...args),
      findFirst: (...args: unknown[]) => catalogueInteractionFindFirst(...args),
    },
    property: {
      findUnique: (...args: unknown[]) => propertyFindUnique(...args),
    },
    followUp: {
      create: (...args: unknown[]) => followUpCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

// api-auth.ts pulls in next-auth (via ./auth), which can't load under a
// plain Node/Vitest environment - mock it with a minimal ApiError so this
// stays a pure unit test of catalogue-interactions.ts, matching the pattern
// already used by catalogue-dto.ts for the same reason.
vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const logActivity = vi.fn();
vi.mock("./activity", () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}));

const createNotification = vi.fn();
vi.mock("./notifications", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const recalculateLeadScore = vi.fn();
vi.mock("./scoring", () => ({
  recalculateLeadScore: (...args: unknown[]) => recalculateLeadScore(...args),
}));

const { recordCatalogueInteraction } = await import("./catalogue-interactions");

const CATALOGUE = {
  id: "cat1",
  organizationId: "org1",
  leadId: "lead1",
  status: "ACTIVE",
  title: "My Catalogue",
  lead: { id: "lead1", clientName: "Rahul Sharma", assignedToId: "emp1" },
};

beforeEach(() => {
  catalogueShareFindUnique.mockReset().mockResolvedValue(CATALOGUE);
  catalogueShareUpdate.mockReset();
  catalogueShareProperty.mockReset().mockResolvedValue({ catalogueShareId: "cat1", propertyId: "prop1" });
  catalogueInteractionCreate.mockReset().mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "int1", createdAt: new Date(), ...args.data })
  );
  catalogueInteractionFindMany.mockReset().mockResolvedValue([]);
  catalogueInteractionFindFirst.mockReset().mockResolvedValue(null);
  propertyFindUnique.mockReset().mockResolvedValue({ id: "prop1", propertyCode: "P-001" });
  followUpCreate.mockReset();
  transaction.mockReset();
  logActivity.mockReset();
  createNotification.mockReset();
  recalculateLeadScore.mockReset();
});

describe("recordCatalogueInteraction - duplicate-click prevention", () => {
  it("returns the existing interaction without inserting a duplicate or re-notifying when the same (catalogue, property, type) was recorded within 5 minutes", async () => {
    const existing = { id: "existing1", createdAt: new Date(), type: "INTERESTED", propertyId: "prop1" };
    catalogueInteractionFindFirst.mockResolvedValue(existing);

    const result = await recordCatalogueInteraction("cat1", { type: "INTERESTED", propertyId: "prop1" });

    expect(result).toBe(existing);
    expect(catalogueInteractionCreate).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(recalculateLeadScore).not.toHaveBeenCalled();
  });

  it("scopes the dedupe lookup to the same catalogue, property and type within the 5-minute window", async () => {
    await recordCatalogueInteraction("cat1", { type: "QUESTION_ASKED", propertyId: "prop1", message: "How old is the building?" });

    expect(catalogueInteractionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          catalogueShareId: "cat1",
          propertyId: "prop1",
          type: "QUESTION_ASKED",
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    );
  });

  it("creates a new interaction (and fires side effects) when no recent duplicate exists", async () => {
    const result = await recordCatalogueInteraction("cat1", { type: "INTERESTED", propertyId: "prop1" });

    expect(catalogueInteractionCreate).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });
});

describe("recordCatalogueInteraction - CALL_REQUESTED", () => {
  it("records a property-less CALL_REQUESTED interaction with activity log + notification side effects", async () => {
    await recordCatalogueInteraction("cat1", { type: "CALL_REQUESTED" });

    expect(catalogueInteractionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "CALL_REQUESTED", propertyId: undefined }),
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead1", description: "Client requested a call back." })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CLIENT_REPLY_RECEIVED", userId: "emp1", leadId: "lead1" })
    );
  });

  it("dedupes CALL_REQUESTED the same way as property-scoped interactions", async () => {
    const existing = { id: "existing-call", createdAt: new Date(), type: "CALL_REQUESTED", propertyId: null };
    catalogueInteractionFindFirst.mockResolvedValue(existing);

    const result = await recordCatalogueInteraction("cat1", { type: "CALL_REQUESTED" });

    expect(result).toBe(existing);
    expect(catalogueInteractionCreate).not.toHaveBeenCalled();
    expect(catalogueInteractionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ propertyId: null, type: "CALL_REQUESTED" }) })
    );
  });
});

describe("recordCatalogueInteraction - WHATSAPP_REQUESTED", () => {
  it("records a property-less WHATSAPP_REQUESTED interaction with activity log + notification side effects", async () => {
    await recordCatalogueInteraction("cat1", { type: "WHATSAPP_REQUESTED" });

    expect(catalogueInteractionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "WHATSAPP_REQUESTED", propertyId: undefined }),
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead1", description: "Client requested to continue on WhatsApp." })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CLIENT_REPLY_RECEIVED", userId: "emp1", leadId: "lead1" })
    );
  });
});

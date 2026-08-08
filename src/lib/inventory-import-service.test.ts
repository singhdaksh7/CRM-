import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  property: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  owner: { findMany: vi.fn(), create: vi.fn() }, inventoryPartner: { findMany: vi.fn(), findFirst: vi.fn() },
  importJob: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }, importRecord: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  propertyTimelineEvent: { createMany: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("./audit", () => ({ recordAudit: vi.fn() }));
import { executeInventoryImport, previewInventoryImport, rollbackCreatedImportProperties } from "./inventory-import-service";

const mapping = { title: "Title", propertyType: "Type", listingType: "Listing", inventorySource: "Source", partnerName: "Partner", area: "Location", address: "Address", monthlyRent: "Rent", bhk: "BHK", bathrooms: "Baths", furnishing: "Furnishing", builtUpAreaSqft: "Sq Ft", ownerName: "Owner", ownerPhone: "Phone" };
const direct = { Title: "Two bedroom apartment", Type: "APARTMENT", Listing: "RENT", Source: "DIR", Partner: "", Location: "Janakpuri", Address: "F Block near metro", Rent: "25k", BHK: "2", Baths: "2", Furnishing: "SEMI_FURNISHED", "Sq Ft": "850", Owner: "Ravi Kumar", Phone: "9876543210" };

beforeEach(() => {
  vi.clearAllMocks(); db.property.findMany.mockResolvedValue([]); db.owner.findMany.mockResolvedValue([]); db.inventoryPartner.findMany.mockResolvedValue([]);
  db.importJob.findFirst.mockResolvedValue(null); db.importJob.create.mockResolvedValue({ id: "job-123456", status: "RUNNING" }); db.importJob.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: "job-123456", ...data }));
  db.owner.create.mockResolvedValue({ id: "owner-new" }); db.property.create.mockResolvedValue({ id: "property-new" }); db.property.update.mockResolvedValue({ id: "property-existing" });
  db.importRecord.create.mockResolvedValue({}); db.importRecord.createMany.mockResolvedValue({ count: 0 }); db.propertyTimelineEvent.createMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (callback: (client: typeof db) => Promise<unknown>) => callback(db));
});

describe("inventory import execution policies", () => {
  it("REQUIRE_ALL_ROWS_VALID performs no write when validation has errors", async () => {
    await expect(executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "bad.csv", rows: [{ ...direct, Phone: "bad" }], mapping, mode: "CREATE_ONLY", partialPolicy: "REQUIRE_ALL_ROWS_VALID" })).rejects.toThrow(/contain errors/);
    expect(db.importJob.create).not.toHaveBeenCalled(); expect(db.property.create).not.toHaveBeenCalled();
  });
  it("IMPORT_VALID_ROWS creates valid rows and records masked row history", async () => {
    const result = await executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "mixed.csv", rows: [direct, { ...direct, Phone: "bad", Title: "Bad row" }], mapping, mode: "CREATE_ONLY", partialPolicy: "IMPORT_VALID_ROWS" });
    expect(result.counts).toMatchObject({ created: 1, skipped: 1, failed: 0 }); expect(db.property.create).toHaveBeenCalledTimes(1);
    expect(db.importRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rawData: expect.stringContaining("******3210") }) }));
  });
  it("safe upsert updates the exact match without clearing omitted fields", async () => {
    db.property.findMany.mockResolvedValue([{ id: "property-existing", propertyCode: "X", title: direct.Title, area: direct.Location, address: direct.Address, floorNumber: null, builtUpAreaSqft: 850, monthlyRent: 25000, salePrice: null, bhk: 2, ownerPhone: "919876543210", internalNotes: "keep me" }]);
    await executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "upsert.csv", rows: [{ ...direct, Rent: "27k" }], mapping, mode: "UPSERT_SAFE", partialPolicy: "REQUIRE_ALL_ROWS_VALID", allowBlankClear: false });
    const data = db.property.update.mock.calls[0][0].data; expect(data.monthlyRent).toBe(27000); expect(data.internalNotes).toBeUndefined(); expect(db.property.create).not.toHaveBeenCalled();
  });
  it("blocks a repeated file hash before creating another job", async () => {
    db.importJob.findFirst.mockResolvedValue({ id: "prior", status: "COMPLETED" });
    await expect(executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "same.csv", fileHash: "a".repeat(64), rows: [direct], mapping, mode: "CREATE_ONLY", partialPolicy: "REQUIRE_ALL_ROWS_VALID" })).rejects.toThrow(/already has import job/);
    expect(db.importJob.create).not.toHaveBeenCalled();
  });
});

describe("inventory import preview service", () => {
  it("uses exactly one batched property, owner and partner lookup", async () => {
    const rows = Array.from({ length: 300 }, () => direct); const result = await previewInventoryImport({ organizationId: "org-a", rows, mapping, mode: "CREATE_ONLY" });
    expect(result).toHaveLength(300); expect(db.property.findMany).toHaveBeenCalledTimes(1); expect(db.owner.findMany).toHaveBeenCalledTimes(1); expect(db.inventoryPartner.findMany).toHaveBeenCalledTimes(0);
  });
  it("scopes every lookup to the caller organization", async () => {
    await previewInventoryImport({ organizationId: "org-private", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(db.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-private" }) }));
    expect(db.owner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-private" } }));
  });
  it("reuses a uniquely normalized owner phone", async () => {
    db.owner.findMany.mockResolvedValue([{ id: "owner-1", phone: "+91 98765-43210" }]);
    const [row] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(row.ownerResolution).toBe("REUSE"); expect(row.ownerId).toBe("owner-1"); expect(row.state).toBe("READY");
  });
  it("requires manual resolution for ambiguous owners", async () => {
    db.owner.findMany.mockResolvedValue([{ id: "o1", phone: "9876543210" }, { id: "o2", phone: "+919876543210" }]);
    const [row] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(row.ownerResolution).toBe("AMBIGUOUS"); expect(row.issues.some((issue) => issue.message.includes("Multiple owners"))).toBe(true);
  });
  it("matches an indirect partner by company name without creating one", async () => {
    db.inventoryPartner.findMany.mockResolvedValue([{ id: "partner-1", name: "Amit", company: "West Delhi Brokers" }]);
    const row = { ...direct, Source: "IND", Partner: "West Delhi Brokers", Owner: "", Phone: "" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY" });
    expect(result.partnerResolution).toBe("MATCHED"); expect(result.partnerId).toBe("partner-1"); expect(result.state).toBe("READY");
  });
  it("does not silently create an unknown inventory partner", async () => {
    const row = { ...direct, Source: "IND", Partner: "Unknown Broker", Owner: "", Phone: "" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY" });
    expect(result.partnerResolution).toBe("NOT_FOUND"); expect(result.state).toBe("ERROR");
  });
  it("allows an authorized explicit existing-partner resolution", async () => {
    db.inventoryPartner.findMany.mockResolvedValue([{ id: "partner-1", name: "Known", company: null }]);
    const row = { ...direct, Source: "IND", Partner: "Unknown Broker", Owner: "", Phone: "", __spreadsheetRowNumber: "57" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", resolutions: { "57": { partnerId: "partner-1" } } });
    expect(result.rowNumber).toBe(57); expect(result.partnerResolution).toBe("MATCHED");
  });
  it("safe upsert updates only exact matches", async () => {
    db.property.findMany.mockResolvedValue([{ id: "p1", propertyCode: "X", title: direct.Title, area: direct.Location, address: direct.Address, floorNumber: null, builtUpAreaSqft: 850, monthlyRent: 25000, salePrice: null, bhk: 2, ownerPhone: "919876543210" }]);
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "UPSERT_SAFE" });
    expect(result.duplicateClass).toBe("EXACT_DUPLICATE"); expect(result.action).toBe("UPDATE_EXISTING");
  });
  it("create-only never updates a duplicate", async () => {
    db.property.findMany.mockResolvedValue([{ id: "p1", propertyCode: "X", title: direct.Title, area: direct.Location, address: direct.Address, floorNumber: null, builtUpAreaSqft: 850, monthlyRent: 25000, salePrice: null, bhk: 2, ownerPhone: "919876543210" }]);
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" }); expect(result.action).toBe("SKIP");
  });
});

describe("created-property rollback safety", () => {
  it("blocks rollback when a created property acquired business dependencies", async () => {
    db.importJob.findFirst.mockResolvedValue({ id: "job", status: "COMPLETED" }); db.importRecord.findMany.mockResolvedValue([{ entityId: "p1" }]); db.property.findMany.mockResolvedValue([{ id: "p1", propertyCode: "PROP-1" }]);
    await expect(rollbackCreatedImportProperties("job", "org-a", "u1")).rejects.toThrow(/dependent business data/); expect(db.property.deleteMany).not.toHaveBeenCalled();
  });
  it("never resolves a cross-organization import", async () => { db.importJob.findFirst.mockResolvedValue(null); await expect(rollbackCreatedImportProperties("job", "org-b", "u1")).rejects.toThrow(/not found/); expect(db.importJob.findFirst).toHaveBeenCalledWith({ where: { id: "job", organizationId: "org-b", entityType: "PROPERTIES" } }); });
});

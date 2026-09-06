import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  property: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  owner: { findMany: vi.fn(), create: vi.fn() }, inventoryPartner: { findMany: vi.fn(), findFirst: vi.fn() },
  propertyLocalityAlias: { findMany: vi.fn(), upsert: vi.fn() }, propertyLocality: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
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
  db.propertyLocalityAlias.findMany.mockResolvedValue([]); db.propertyLocalityAlias.upsert.mockResolvedValue({}); db.propertyLocality.findMany.mockResolvedValue([]);
  db.propertyLocality.findUnique.mockResolvedValue(null); db.propertyLocality.create.mockResolvedValue({ id: "loc-created" });
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
  it("preserves the existing zero bathroom default for a workbook-shaped sale row without inferring a count", async () => {
    const workbookSaleMapping = {
      propertyCode: "S.NO", area: "LOCATION", address: "ADDRESS", salePrice: "PRICE", floorNumber: "FLOOR",
      builtUpAreaSqft: "SQ.FT", inventorySource: "DIR/IND", ownerName: "OWNER", ownerPhone: "PHONE NO",
    };
    const workbookSaleRow = {
      "S.NO": "KP-XLS-2BHK-SALE-15", LOCATION: "Bali Nagar", ADDRESS: "F-41", PRICE: "87L", FLOOR: "3 RD WITH ROOF",
      "SQ.FT": "900", "DIR/IND": "DIRECT", OWNER: "Source Owner", "PHONE NO": "8527126123",
    };

    const result = await executeInventoryImport({
      organizationId: "org-a", actorId: "u1", fileName: "INVENTORY FOR SALE(AutoRecovered).xlsx",
      rows: [workbookSaleRow], mapping: workbookSaleMapping, mode: "CREATE_ONLY", partialPolicy: "REQUIRE_ALL_ROWS_VALID",
      sheetName: "2BHK SALE", sheetTitle: "2 BHK FOR SALE",
    });

    expect(result.counts).toMatchObject({ created: 1, failed: 0 });
    expect(db.property.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bathrooms: 0, bhk: 2, salePrice: 8_700_000, area: "Bali Nagar", address: "F-41",
        listingType: "SALE", propertyType: "OTHER", inventorySource: "DIRECT",
      }),
    }));
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
    expect(result.partnerResolution).toBe("NOT_FOUND"); expect(result.sourceResolution).toBe("REQUIRED"); expect(result.state).toBe("NEEDS_REVIEW");
  });
  it("requires a Data Manager source decision for ambiguous source text", async () => {
    const row = { ...direct, Source: "BAWA SIR NE DIYA HAI", Owner: "", Phone: "" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY" });
    expect(result.sourceResolution).toBe("REQUIRED"); expect(result.data.inventorySource).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({ field: "inventorySource", severity: "ERROR" }));
  });
  it("automatically resolves a known source name to its org-scoped InventoryPartner", async () => {
    db.inventoryPartner.findMany.mockResolvedValue([{ id: "partner-nanak", name: "Nanak", company: null }]);
    const row = { ...direct, Source: "NANAK", Owner: "", Phone: "" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY" });
    expect(result.sourceResolution).toBe("AUTO_MAPPED_BROKER");
    expect(result.data).toMatchObject({ inventorySource: "INDIRECT", partnerId: "partner-nanak", sourceRaw: "NANAK" });
  });
  it("uses an explicit Direct Owner source decision without inventing a broker", async () => {
    const row = { ...direct, Source: "unclear note" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", resolutions: { "2": { inventorySource: "DIRECT" } } });
    expect(result.sourceResolution).toBe("CONFIRMED"); expect(result.data.inventorySource).toBe("DIRECT"); expect(result.data.partnerId).toBeNull();
  });
  it("applies one grouped source decision to all whitespace/case-equivalent rows", async () => {
    db.inventoryPartner.findMany.mockResolvedValue([{ id: "partner-1", name: "Bawa Sir", company: null }]);
    const rows = [
      { ...direct, Source: " BAWA   SIR ", Owner: "", Phone: "" },
      { ...direct, Source: "bawa sir", Owner: "", Phone: "", __spreadsheetRowNumber: "3" },
    ];
    const result = await previewInventoryImport({ organizationId: "org-a", rows, mapping, mode: "CREATE_ONLY", sourceResolutions: { "bawa sir": { inventorySource: "INDIRECT", partnerId: "partner-1" } } });
    expect(result).toHaveLength(2);
    expect(result.every((row) => row.partnerId === "partner-1" && row.data.inventorySource === "INDIRECT" && row.state !== "NEEDS_REVIEW")).toBe(true);
  });
  it("keeps blank and unknown source groups unresolved until a group choice is made", async () => {
    const rows = [{ ...direct, Source: "", Owner: "", Phone: "" }, { ...direct, Source: "BAWA SIR", Owner: "", Phone: "", __spreadsheetRowNumber: "3" }];
    const result = await previewInventoryImport({ organizationId: "org-a", rows, mapping, mode: "CREATE_ONLY" });
    expect(result.map((row) => row.state)).toEqual(["NEEDS_REVIEW", "NEEDS_REVIEW"]);
    expect(result.every((row) => row.sourceResolution === "REQUIRED")).toBe(true);
  });
  it("recalculates grouped rows after a direct source decision", async () => {
    const row = { ...direct, Source: "BAWA SIR", Owner: "", Phone: "" };
    const [before] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY" });
    const [after] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", sourceResolutions: { "bawa sir": { inventorySource: "DIRECT" } } });
    expect(before.state).toBe("NEEDS_REVIEW"); expect(after.data.inventorySource).toBe("DIRECT"); expect(after.state).not.toBe("NEEDS_REVIEW");
  });
  it("accepts a selected broker only when it belongs to the importing organization", async () => {
    db.inventoryPartner.findMany.mockResolvedValue([]);
    const row = { ...direct, Source: "BAWA SIR", Owner: "", Phone: "" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", sourceResolutions: { "bawa sir": { inventorySource: "INDIRECT", partnerId: "partner-from-org-b" } } });
    expect(result.partnerResolution).toBe("NOT_FOUND"); expect(result.state).toBe("NEEDS_REVIEW");
    expect(db.inventoryPartner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) }));
  });
  it("allows an authorized explicit existing-partner resolution", async () => {
    db.inventoryPartner.findMany.mockResolvedValue([{ id: "partner-1", name: "Known", company: null }]);
    const row = { ...direct, Source: "IND", Partner: "Unknown Broker", Owner: "", Phone: "", __spreadsheetRowNumber: "57" };
    const [result] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", resolutions: { "57": { partnerId: "partner-1" } } });
    expect(result.rowNumber).toBe(57); expect(result.partnerResolution).toBe("MATCHED");
  });
  it("requires a broker for an exact indirect source until one is selected", async () => {
    const row = { ...direct, Source: "IND", Partner: "", Owner: "", Phone: "" };
    const [unresolved] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY" });
    expect(unresolved.state).toBe("NEEDS_REVIEW");
    db.inventoryPartner.findMany.mockResolvedValue([{ id: "partner-1", name: "Broker", company: null }]);
    const [resolved] = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", sourceResolutions: { "ind": { partnerId: "partner-1" } } });
    expect(resolved.partnerId).toBe("partner-1"); expect(resolved.state).not.toBe("NEEDS_REVIEW");
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
  it("uses identical sheet defaults in preview and execute", async () => {
    const row = { ...direct, Title: "", Type: "", Listing: "", BHK: "" };
    const preview = await previewInventoryImport({ organizationId: "org-a", rows: [row], mapping, mode: "CREATE_ONLY", sheetName: "2BHK SALE", sheetTitle: "2 BHK FOR SALE" });
    const executed = await executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "sheet.csv", rows: [row], mapping, mode: "CREATE_ONLY", partialPolicy: "REQUIRE_ALL_ROWS_VALID", sheetName: "2BHK SALE", sheetTitle: "2 BHK FOR SALE" });
    expect(executed.rows[0].data).toMatchObject({ assetClass: preview[0].data.assetClass, propertyType: preview[0].data.propertyType, bhk: preview[0].data.bhk, listingType: preview[0].data.listingType });
  });
});

describe("locality alias resolution", () => {
  it("resolves via an existing alias within the org, skipping the plain locality match", async () => {
    db.propertyLocalityAlias.findMany.mockResolvedValue([{ normalizedAlias: "janakpuri", localityId: "loc-1" }]);
    db.propertyLocality.findMany.mockResolvedValue([{ normalizedName: "janakpuri", id: "loc-other" }]);
    const [row] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(row.localityResolution).toBe("ALIAS_MATCHED"); expect(row.localityId).toBe("loc-1"); expect(row.data.localityId).toBe("loc-1");
  });
  it("falls back to an exact PropertyLocality match when no alias exists", async () => {
    db.propertyLocality.findMany.mockResolvedValue([{ normalizedName: "janakpuri", id: "loc-2" }]);
    const [row] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(row.localityResolution).toBe("MATCHED"); expect(row.localityId).toBe("loc-2");
  });
  it("surfaces NOT_FOUND without blocking the row when neither an alias nor a locality matches", async () => {
    const [row] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(row.localityResolution).toBe("NOT_FOUND"); expect(row.localityId).toBeNull();
    expect(row.issues.some((issue) => issue.severity === "ERROR")).toBe(false);
  });
  it("creates and attaches an org-scoped locality for a NOT_FOUND create row", async () => {
    await executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "new-locality.csv", rows: [direct], mapping, mode: "CREATE_ONLY", partialPolicy: "REQUIRE_ALL_ROWS_VALID" });
    expect(db.propertyLocality.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-a", normalizedName: "janakpuri" }) }));
    expect(db.property.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ localityId: "loc-created" }) }));
  });
  it("never resolves an alias created for a different organization", async () => {
    db.propertyLocalityAlias.findMany.mockImplementation(({ where }: { where: { organizationId: string } }) =>
      Promise.resolve(where.organizationId === "org-a" ? [{ normalizedAlias: "janakpuri", localityId: "loc-1" }] : []));
    const [rowA] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    const [rowB] = await previewInventoryImport({ organizationId: "org-b", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(rowA.localityResolution).toBe("ALIAS_MATCHED"); expect(rowB.localityResolution).toBe("NOT_FOUND");
    expect(db.propertyLocalityAlias.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) }));
    expect(db.propertyLocalityAlias.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-b" }) }));
  });
  it("persists a chosen alias resolution on execute and reuses it on the next preview", async () => {
    // The alias's localityId must resolve to a PropertyLocality this org
    // actually owns before it's persisted - see the cross-org test below.
    db.propertyLocality.findMany.mockResolvedValue([{ id: "loc-9" }]);
    await executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "aliases.csv", rows: [direct], mapping, mode: "CREATE_ONLY", partialPolicy: "IMPORT_VALID_ROWS", localityAliasResolutions: [{ alias: "Janakpuri", localityId: "loc-9" }] });
    expect(db.propertyLocalityAlias.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_normalizedAlias: { organizationId: "org-a", normalizedAlias: "janakpuri" } },
      create: expect.objectContaining({ organizationId: "org-a", normalizedAlias: "janakpuri", localityId: "loc-9" }),
    }));
    // Simulate the alias now existing in the DB for the next preview call within the same org.
    db.propertyLocalityAlias.findMany.mockResolvedValue([{ normalizedAlias: "janakpuri", localityId: "loc-9" }]);
    const [row] = await previewInventoryImport({ organizationId: "org-a", rows: [direct], mapping, mode: "CREATE_ONLY" });
    expect(row.localityResolution).toBe("ALIAS_MATCHED"); expect(row.localityId).toBe("loc-9");
  });
  it("never persists an alias pointing at a locality the organization does not own", async () => {
    // Org-a does not own "loc-from-org-b" - the ownership lookup returns
    // nothing for it, so the alias upsert must never be called.
    db.propertyLocality.findMany.mockResolvedValue([]);
    await executeInventoryImport({ organizationId: "org-a", actorId: "u1", fileName: "aliases.csv", rows: [direct], mapping, mode: "CREATE_ONLY", partialPolicy: "IMPORT_VALID_ROWS", localityAliasResolutions: [{ alias: "Janakpuri", localityId: "loc-from-org-b" }] });
    expect(db.propertyLocalityAlias.upsert).not.toHaveBeenCalled();
  });
});

describe("created-property rollback safety", () => {
  it("blocks rollback when a created property acquired business dependencies", async () => {
    db.importJob.findFirst.mockResolvedValue({ id: "job", status: "COMPLETED" }); db.importRecord.findMany.mockResolvedValue([{ entityId: "p1" }]); db.property.findMany.mockResolvedValue([{ id: "p1", propertyCode: "PROP-1" }]);
    await expect(rollbackCreatedImportProperties("job", "org-a", "u1")).rejects.toThrow(/dependent business data/); expect(db.property.deleteMany).not.toHaveBeenCalled();
  });
  it("never resolves a cross-organization import", async () => { db.importJob.findFirst.mockResolvedValue(null); await expect(rollbackCreatedImportProperties("job", "org-b", "u1")).rejects.toThrow(/not found/); expect(db.importJob.findFirst).toHaveBeenCalledWith({ where: { id: "job", organizationId: "org-b", entityType: "PROPERTIES" } }); });
});

import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

const MAX_EXPORT_ROWS = 500;

/** Also guards against CSV/Excel formula injection - see src/lib/report-builder.ts's csvEscape for the full rationale. */
function csvEscape(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const idsParam = req.nextUrl.searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

    const properties = await prisma.property.findMany({
      where: { organizationId, ...(ids ? { id: { in: ids } } : {}) },
      take: MAX_EXPORT_ROWS,
      orderBy: { createdAt: "desc" },
    });

    // Asset Class (Residential/Commercial) + Property Type let an exported
    // sheet be told apart without guessing from the title, and both headers
    // are auto-mapped by the inventory importer ("Asset Class" -> assetClass;
    // note "Category" is already an importer alias for propertyType, so it is
    // deliberately not used here). BHK is blank for commercial, not 0.
    const header = ["Property Code", "Title", "Asset Class", "Property Type", "Listing Type", "Status", "Area", "BHK", "Built-up Area (sqft)", "Carpet Area (sqft)", "Monthly Rent", "Sale Price", "Owner Phone", "Created At"];
    const rows = properties.map((p) => [
      p.propertyCode,
      p.title,
      p.assetClass,
      p.propertyType,
      p.listingType,
      p.status,
      p.area,
      p.assetClass === "COMMERCIAL" ? "" : p.bhk,
      p.builtUpAreaSqft,
      p.carpetAreaSqft ?? "",
      p.monthlyRent ?? "",
      p.salePrice ?? "",
      p.ownerPhone,
      p.createdAt.toISOString(),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");

    await recordAudit({ userId: session.user.id, action: "EXPORT", entityType: "Property", newValues: { count: properties.length } });

    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="properties-export-${Date.now()}.csv"` },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

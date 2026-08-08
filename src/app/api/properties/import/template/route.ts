import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { INVENTORY_TEMPLATE_HEADERS, protectCsvCell } from "@/lib/inventory-import-core";

export async function GET() {
  try {
    await requireSession(["ADMIN", "DATA_MANAGER"]);
    const sample = ["SAMPLE-DO-NOT-IMPORT", "2 BHK SAMPLE", "RENT", "APARTMENT", "DIRECT", "Janakpuri", "F Block SAMPLE", "", "Near Metro", "110058", "25000", "", "2", "4", "850", "", "20x42", "Ready to Move", "", "2", "2", "SEMI_FURNISHED", "Yes", "Yes", "AVAILABLE", "Sample Owner", "9876543210", "", "SAMPLE ROW - delete before import", "Sample property for mapping only"].map(protectCsvCell).join(",");
    return new NextResponse(`${INVENTORY_TEMPLATE_HEADERS}\r\n${sample}\r\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="inventory-import-template.csv"', "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return handleApiError(error); }
}

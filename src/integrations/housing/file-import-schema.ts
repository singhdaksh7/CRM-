/**
 * Pure column/data definitions - no DB access, no secrets, nothing
 * server-only - so this module is safe to import from the client-side
 * import wizard (for its column list/types) as well as from the server-side
 * orchestration in ../../lib/housing-import.ts.
 *
 * Housing lead EXPORT file contract (staff-uploaded CSV/XLSX), as
 * distinct from the live lead-push webhook (see ./schema.ts). Housing's
 * documented export carries these exact columns; nothing beyond them is
 * assumed. Every field here is untrusted, staff-uploaded input and is
 * validated/normalized before anything downstream ever sees it - see
 * ./file-import-adapter.ts.
 */
export const HOUSING_FILE_IMPORT_COLUMNS = [
  "Service Type",
  "Property Type",
  "Lead Date",
  "Lead Name",
  "Lead Phone Number",
  "Lead Email",
  "Seller Id",
  "Seller Name",
  "Locality",
  "City",
  "Configuration",
  "Price",
  "Building/Project Name",
  "Property/Project ID",
  "Address",
  "primary_lead_status",
  "secondary_lead_status",
  "Notes",
] as const;

export type HousingFileImportColumn = (typeof HOUSING_FILE_IMPORT_COLUMNS)[number];

/** Rows missing any of these cannot become a Lead at all - flagged INVALID, never guessed. */
export const HOUSING_FILE_REQUIRED_COLUMNS: HousingFileImportColumn[] = ["Lead Name", "Lead Phone Number", "Locality"];

const HEADER_ALIASES: Record<string, HousingFileImportColumn> = {
  "service type": "Service Type",
  "property type": "Property Type",
  "lead date": "Lead Date",
  "enquiry date": "Lead Date",
  "lead name": "Lead Name",
  "customer name": "Lead Name",
  name: "Lead Name",
  "lead phone number": "Lead Phone Number",
  "lead phone": "Lead Phone Number",
  phone: "Lead Phone Number",
  mobile: "Lead Phone Number",
  "lead email": "Lead Email",
  email: "Lead Email",
  "seller id": "Seller Id",
  "seller name": "Seller Name",
  locality: "Locality",
  city: "City",
  configuration: "Configuration",
  bhk: "Configuration",
  price: "Price",
  "building/project name": "Building/Project Name",
  "building project name": "Building/Project Name",
  "project name": "Building/Project Name",
  "property/project id": "Property/Project ID",
  "property project id": "Property/Project ID",
  "project id": "Property/Project ID",
  address: "Address",
  primary_lead_status: "primary_lead_status",
  "primary lead status": "primary_lead_status",
  secondary_lead_status: "secondary_lead_status",
  "secondary lead status": "secondary_lead_status",
  notes: "Notes",
  remarks: "Notes",
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Best-effort column-mapping suggestion for the "map columns" wizard step - never authoritative, staff can override every field before preview. */
export function suggestHousingFileMapping(headers: string[]): Record<HousingFileImportColumn, string> {
  const mapping = {} as Record<HousingFileImportColumn, string>;
  for (const header of headers) {
    const field = HEADER_ALIASES[normalizeHeaderKey(header)];
    if (field && !mapping[field]) mapping[field] = header;
  }
  return mapping;
}

/** True only when every column the importer cannot function without is mapped to some header in the uploaded file. */
export function missingRequiredColumns(mapping: Partial<Record<HousingFileImportColumn, string>>): HousingFileImportColumn[] {
  return HOUSING_FILE_REQUIRED_COLUMNS.filter((column) => !mapping[column]);
}

/** Extracts the mapped Housing columns (only) out of one raw parsed row, trimming values. Unmapped/unexpected extra columns in the source file are simply ignored - never rejected. */
export function extractHousingRow(row: Record<string, string>, mapping: Partial<Record<HousingFileImportColumn, string>>): Partial<Record<HousingFileImportColumn, string>> {
  const out: Partial<Record<HousingFileImportColumn, string>> = {};
  for (const column of HOUSING_FILE_IMPORT_COLUMNS) {
    const header = mapping[column];
    if (!header) continue;
    const value = row[header];
    if (value !== undefined && value.trim() !== "") out[column] = value.trim();
  }
  return out;
}

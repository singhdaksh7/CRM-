/**
 * Client-side CSV / simple TSV parse for customer import wizard.
 * XLSX is uploaded to backend parse when available; CSV works fully offline.
 */

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[]; sheetNames: string[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], sheetNames: ["Sheet1"] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows, sheetNames: ["Sheet1"] };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export const CONTACT_IMPORT_FIELDS = [
  "name",
  "phone",
  "email",
  "notes",
  "assetClass",
  "transactionType",
  "bhk",
  "commercialPropertyType",
  "locality",
  "minBudget",
  "maxBudget",
  "minArea",
  "maxArea",
  "floorPreference",
  "furnishing",
  "parkingRequired",
  "liftRequired",
  "commercialFitOutPref",
  "workstations",
  "cabins",
  "possession",
  "requirementNotes",
] as const;

export type ContactImportField = (typeof CONTACT_IMPORT_FIELDS)[number];

const HEADER_ALIASES: Record<string, ContactImportField> = {
  name: "name",
  "customer name": "name",
  "client name": "name",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  email: "email",
  notes: "notes",
  "asset class": "assetClass",
  residential_commercial: "assetClass",
  transaction: "transactionType",
  "transaction type": "transactionType",
  rent_sale: "transactionType",
  bhk: "bhk",
  "commercial type": "commercialPropertyType",
  subtype: "commercialPropertyType",
  locality: "locality",
  area: "locality",
  "preferred locality": "locality",
  "min budget": "minBudget",
  "max budget": "maxBudget",
  "min area": "minArea",
  "max area": "maxArea",
  floor: "floorPreference",
  furnishing: "furnishing",
  parking: "parkingRequired",
  lift: "liftRequired",
  "fit out": "commercialFitOutPref",
  workstations: "workstations",
  cabins: "cabins",
  possession: "possession",
  "requirement notes": "requirementNotes",
};

export function suggestContactMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const key = header.trim().toLowerCase();
    const field = HEADER_ALIASES[key];
    if (field && !mapping[field]) mapping[field] = header;
  }
  return mapping;
}

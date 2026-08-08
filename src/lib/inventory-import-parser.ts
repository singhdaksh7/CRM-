import "server-only";
import ExcelJS from "exceljs";
import { INVENTORY_IMPORT_MAX_BYTES, INVENTORY_IMPORT_MAX_ROWS, suggestColumnMapping } from "./inventory-import-core";

const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "application/csv", "text/plain", "application/octet-stream",
]);

export interface ParsedInventorySheet {
  sheetNames: string[];
  selectedSheet: string;
  headerRow: number;
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  ambiguousMappings: Record<string, string[]>;
  truncated: boolean;
}

function extension(name: string) { return name.toLowerCase().slice(name.lastIndexOf(".")); }

export function validateInventoryFile(file: Pick<File, "name" | "size" | "type">) {
  const ext = extension(file.name);
  if (ext === ".xls") throw new Error("Legacy .xls files are not accepted safely. Save the workbook as .xlsx or .csv first.");
  if (![".xlsx", ".csv"].includes(ext)) throw new Error("Only .xlsx and .csv inventory files are supported");
  if (file.size <= 0) throw new Error("The uploaded file is empty");
  if (file.size > INVENTORY_IMPORT_MAX_BYTES) throw new Error(`File exceeds the ${Math.round(INVENTORY_IMPORT_MAX_BYTES / 1024 / 1024)} MB upload limit`);
  if (file.type && !ALLOWED_MIME.has(file.type)) throw new Error("The file MIME type does not match an accepted spreadsheet format");
  return ext;
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text);
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value) { const link = value as { text?: string; hyperlink?: string }; return String(link.text ?? link.hyperlink ?? ""); }
  }
  return String(value).trim();
}

function detectHeader(matrix: string[][]): number {
  let best = 0; let bestScore = -1;
  matrix.slice(0, 10).forEach((row, index) => {
    const cells = row.map((cell) => cell.trim()).filter(Boolean);
    const known = Object.keys(suggestColumnMapping(cells).mapping).length;
    const score = known * 10 + new Set(cells.map((cell) => cell.toLowerCase())).size;
    if (cells.length >= 2 && score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}

function materialize(matrix: string[][], sheetNames: string[], selectedSheet: string): ParsedInventorySheet {
  const headerIndex = detectHeader(matrix);
  const rawHeaders = matrix[headerIndex] ?? [];
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0; seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
  const sourceRows = matrix.slice(headerIndex + 1).map((row, index) => ({ row, rowNumber: headerIndex + index + 2 })).filter(({ row }) => row.some((cell) => cell.trim() !== ""));
  const rows = sourceRows.slice(0, INVENTORY_IMPORT_MAX_ROWS).map(({ row, rowNumber }) => ({ ...Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])), __spreadsheetRowNumber: String(rowNumber) }));
  const suggestions = suggestColumnMapping(headers);
  return { sheetNames, selectedSheet, headerRow: headerIndex + 1, headers, rows, suggestedMapping: suggestions.mapping, ambiguousMappings: suggestions.ambiguous, truncated: sourceRows.length > rows.length };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

export async function parseInventoryFile(file: File, requestedSheet?: string): Promise<ParsedInventorySheet> {
  const ext = validateInventoryFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (ext === ".csv") return materialize(parseCsv(new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/^\uFEFF/, "")), ["CSV"], "CSV");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  if (!sheetNames.length) throw new Error("The workbook contains no worksheets");
  const selectedSheet = requestedSheet ?? sheetNames[0];
  const sheet = workbook.getWorksheet(selectedSheet);
  if (!sheet) throw new Error("Selected worksheet was not found");
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const cells: string[] = [];
    for (let index = 1; index <= excelRow.cellCount; index++) cells.push(cellText(excelRow.getCell(index).value));
    matrix.push(cells);
  });
  return materialize(matrix, sheetNames, selectedSheet);
}

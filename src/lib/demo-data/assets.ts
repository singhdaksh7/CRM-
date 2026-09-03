import fs from "fs";
import path from "path";
import type { PropertyType } from "@prisma/client";

/**
 * "DO NOT use external URLs... Use local demo assets. If demo assets don't
 * exist: create placeholder image references" - this repo has no property
 * photo assets checked in (photos are normally user-uploaded via S3/
 * Firebase, see src/lib/storage-providers/), so this generates small, self
 * contained SVG placeholders on first run and writes them under `public/`
 * (the only location Next.js serves static files from - prisma/demo-assets
 * would not be reachable by the browser). Deterministic: same file names,
 * same content, every run: existing files are left untouched, never
 * regenerated, so this is a no-op after the first `npm run seed:demo`.
 */

const PROPERTY_TYPE_COLORS: Partial<Record<PropertyType, string>> = {
  APARTMENT: "#3366FF",
  INDEPENDENT_HOUSE: "#1FA971",
  VILLA: "#B37FEB",
  BUILDER_FLOOR: "#FF9F40",
  PLOT: "#8A94A6",
  COMMERCIAL_SHOP: "#E5484D",
  COMMERCIAL_OFFICE: "#00B8D9",
  PG: "#FFC53D",
};

const PROPERTY_TYPE_LABELS: Partial<Record<PropertyType, string>> = {
  APARTMENT: "Apartment",
  INDEPENDENT_HOUSE: "Independent House",
  VILLA: "Villa",
  BUILDER_FLOOR: "Builder Floor",
  PLOT: "Plot",
  COMMERCIAL_SHOP: "Commercial Shop",
  COMMERCIAL_OFFICE: "Commercial Office",
  PG: "PG",
};

const VARIANTS_PER_TYPE = 3;
const ASSET_DIR = path.join(process.cwd(), "public", "demo-assets", "properties");

function svgFor(label: string, color: string, variant: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${color}"/>
  <rect x="0" y="640" width="1200" height="160" fill="rgba(0,0,0,0.25)"/>
  <text x="600" y="380" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>
  <text x="600" y="450" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.85)" text-anchor="middle">Demo listing photo ${variant}</text>
  <text x="600" y="740" font-family="Arial, sans-serif" font-size="22" fill="#ffffff" text-anchor="middle">KP Properties Demo - placeholder image</text>
</svg>`;
}

/** Idempotent: writes each file only if it doesn't already exist. Returns the public URL paths keyed by property type. */
export function ensureDemoPropertyAssets(): Record<PropertyType, string[]> {
  fs.mkdirSync(ASSET_DIR, { recursive: true });

  const result = {} as Record<PropertyType, string[]>;
  for (const type of Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]) {
    const urls: string[] = [];
    for (let v = 1; v <= VARIANTS_PER_TYPE; v++) {
      const fileName = `${type.toLowerCase()}-${v}.svg`;
      const filePath = path.join(ASSET_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, svgFor(PROPERTY_TYPE_LABELS[type] ?? type, PROPERTY_TYPE_COLORS[type] ?? "#3366FF", v), "utf-8");
      }
      urls.push(`/demo-assets/properties/${fileName}`);
    }
    result[type] = urls;
  }
  return result;
}

const DOCUMENT_ASSET_DIR = path.join(process.cwd(), "public", "demo-assets", "documents");

function documentSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100">
  <rect width="850" height="1100" fill="#FAFBFC"/>
  <rect x="20" y="20" width="810" height="1060" fill="none" stroke="#E7ECF2" stroke-width="4"/>
  <text x="425" y="540" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#596579" text-anchor="middle">${label}</text>
  <text x="425" y="590" font-family="Arial, sans-serif" font-size="22" fill="#8A94A6" text-anchor="middle">Demo document placeholder - not a real document</text>
</svg>`;
}

const AVAILABILITY_REPORT_ASSET_DIR = path.join(process.cwd(), "public", "demo-assets", "availability-reports");

/**
 * Phase 4 - PropertyAvailabilityReport.photoId is a required FK to a real
 * PropertyImage (purpose AVAILABILITY_REPORT), enforced at the route layer
 * to prevent fake/lazy reports. Demo data must exercise that same required
 * relationship, not bypass it - so this generates one placeholder "photo
 * evidence" asset, idempotent, same pattern as the other asset helpers here.
 */
export function ensureDemoAvailabilityReportAsset(): string {
  fs.mkdirSync(AVAILABILITY_REPORT_ASSET_DIR, { recursive: true });
  const fileName = "evidence-photo.svg";
  const filePath = path.join(AVAILABILITY_REPORT_ASSET_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#596579"/>
  <text x="600" y="380" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff" text-anchor="middle">Availability Report Photo</text>
  <text x="600" y="440" font-family="Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.85)" text-anchor="middle">Demo evidence placeholder - not a real photo</text>
</svg>`;
    fs.writeFileSync(filePath, svg, "utf-8");
  }
  return `/demo-assets/availability-reports/${fileName}`;
}

/** One placeholder per document category used by demo-data/documents.ts. Idempotent, same pattern as property assets above. */
export function ensureDemoDocumentAssets(categories: string[]): Record<string, string> {
  fs.mkdirSync(DOCUMENT_ASSET_DIR, { recursive: true });
  const result: Record<string, string> = {};
  for (const category of categories) {
    const fileName = `${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    const filePath = path.join(DOCUMENT_ASSET_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, documentSvg(category.replace(/_/g, " ")), "utf-8");
    }
    result[category] = `/demo-assets/documents/${fileName}`;
  }
  return result;
}

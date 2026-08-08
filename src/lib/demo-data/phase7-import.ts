/** Deterministic Phase 7 fixture; never uploaded or executed automatically. */
export const DEMO_INVENTORY_IMPORT_FIXTURE = [
  ...Array.from({ length: 10 }, (_, index) => ({
    "Serial Number": `KP-DEMO-IMPORT-${String(index + 1).padStart(2, "0")}`,
    Title: `${index % 2 ? "Indirect" : "Direct"} demo inventory ${index + 1}`,
    "Listing Type": index % 3 ? "RENT" : "SALE", "Property Type": "APARTMENT", Location: index % 2 ? "Janakpuri" : "Dwarka",
    "Specific Address": `SAMPLE ${String.fromCharCode(65 + index)} Block`, "DIR/IND": index % 2 ? "IND" : "DIR", Partner: index % 2 ? "KP Demo Partner 01" : "",
    "Owner Name": index % 2 ? "" : index < 4 ? "Shared Demo Owner" : `Demo Owner ${index}`, "Owner Phone": index % 2 ? "" : index < 4 ? "9876500001" : `98765000${String(index).padStart(2, "0")}`,
    "Square Feet": `${800 + index * 25} sq ft`, BHK: "2", Bathrooms: "2", Furnishing: "SEMI_FURNISHED", Rent: index % 3 ? "25k" : "", "Sale Price": index % 3 ? "" : "1.25cr", Possession: "Ready to Move", "Parking/Lift": "Parking + Lift",
  })),
  { Scenario: "EXACT_DUPLICATE", "Serial Number": "KP-DEMO-PROP-00001", Title: "Exact duplicate" },
  { Scenario: "PROBABLE_DUPLICATE", Title: "Probable duplicate", Location: "Janakpuri", "Specific Address": "A Block", "Owner Phone": "9876500001", BHK: "2", "Square Feet": "800" },
  { Scenario: "INVALID_PHONE", Title: "Invalid phone", "Owner Phone": "98ABC123" },
  { Scenario: "INVALID_PRICE", Title: "Invalid price", Rent: "about twenty five thousand" },
  { Scenario: "MISSING_REQUIRED_AND_UPDATE", "Serial Number": "KP-DEMO-PROP-00002", Status: "RENTED", Notes: "Exercises update-existing plus missing required create validation" },
] as const;

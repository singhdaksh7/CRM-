/** Only client-relevant fields may create a new matching lifecycle. */
const FIELDS = ["status", "monthlyRent", "salePrice", "area", "bhk", "propertyType", "builtUpAreaSqft", "furnishing", "availableFrom"] as const;
export type RematchableProperty = Record<(typeof FIELDS)[number], unknown>;

export function shouldRematchProperty(oldProperty: RematchableProperty | null, newProperty: RematchableProperty): boolean {
  if (!oldProperty) return newProperty.status === "AVAILABLE";
  return FIELDS.some((field) => oldProperty[field] !== newProperty[field]);
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { Property } from "@prisma/client";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PropertyGallery } from "@/components/properties/property-gallery";
import { PropertyAddressSearch, type AppliedLocation } from "@/components/properties/property-address-search";
import { LocalityCombobox } from "@/components/properties/locality-combobox";

const AMENITIES_POOL = ["Lift", "Power Backup", "24x7 Security", "Swimming Pool", "Gym", "Club House", "Children's Play Area", "Covered Parking", "CCTV", "Park Facing", "Modular Kitchen", "Water Storage"];

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

type FormValues = {
  assetClass: "RESIDENTIAL" | "COMMERCIAL";
  title: string;
  propertyType: string;
  listingType: "RENT" | "SALE";
  status: string;
  description: string;
  area: string;
  address: string;
  landmark: string;
  monthlyRent: string;
  securityDeposit: string;
  maintenanceCharge: string;
  rentBrokerage: string;
  salePrice: string;
  pricePerSqft: string;
  saleBrokeragePct: string;
  negotiable: boolean;
  bhk: string;
  bathrooms: string;
  balconies: string;
  furnishing: string;
  floorNumber: string;
  totalFloors: string;
  propertyAgeYears: string;
  builtUpAreaSqft: string;
  carpetAreaSqft: string;
  facing: string;
  parkingAvailable: boolean;
  liftAvailable: boolean;
  tenantPreference: string;
  availableFrom: string;
  amenities: string[];
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string;
  placeId: string;
  coverImage: string;
  videoUrl: string;
  virtualTourUrl: string;
  ownerName: string;
  ownerPhone: string;
  ownerAlternatePhone: string;
  ownerNotes: string;
  inventorySource: "DIRECT" | "INDIRECT";
  partnerId: string;
  buildingName: string;
  flatNumber: string;
  gateNumber: string;
  propertySource: string;
  keyAvailability: string;
  entryInstructions: string;
  internalNotes: string;
  negotiationNotes: string;
  hiddenRemarks: string;
  commercialFitOut: string;
  superAreaSqft: string;
  frontageFeet: string;
  ceilingHeightFeet: string;
  cabins: string;
  workstations: string;
  washrooms: string;
  pantryAvailable: boolean;
  goodsLiftAvailable: boolean;
  loadingAccessAvailable: boolean;
  powerLoadKw: string;
  suitableForTags: string[];
  leaseTermMonths: string;
  lockInPeriodMonths: string;
  noticePeriodMonths: string;
  escalationPercentage: string;
  camCharge: string;
};

function toFormValues(p?: Property): FormValues {
  return {
    assetClass: p?.assetClass ?? "RESIDENTIAL",
    title: p?.title ?? "",
    propertyType: p?.propertyType ?? "APARTMENT",
    listingType: (p?.listingType as "RENT" | "SALE") ?? "RENT",
    status: p?.status ?? "AVAILABLE",
    description: p?.description ?? "",
    area: p?.area ?? "",
    address: p?.address ?? "",
    landmark: p?.landmark ?? "",
    monthlyRent: p?.monthlyRent?.toString() ?? "",
    securityDeposit: p?.securityDeposit?.toString() ?? "",
    maintenanceCharge: p?.maintenanceCharge?.toString() ?? "",
    rentBrokerage: p?.rentBrokerage?.toString() ?? "",
    salePrice: p?.salePrice?.toString() ?? "",
    pricePerSqft: p?.pricePerSqft?.toString() ?? "",
    saleBrokeragePct: p?.saleBrokeragePct?.toString() ?? "",
    negotiable: p?.negotiable ?? false,
    bhk: p?.bhk?.toString() ?? "2",
    bathrooms: p?.bathrooms?.toString() ?? "2",
    balconies: p?.balconies?.toString() ?? "1",
    furnishing: p?.furnishing ?? "SEMI_FURNISHED",
    floorNumber: p?.floorNumber?.toString() ?? "",
    totalFloors: p?.totalFloors?.toString() ?? "",
    propertyAgeYears: p?.propertyAgeYears?.toString() ?? "",
    builtUpAreaSqft: p?.builtUpAreaSqft?.toString() ?? "",
    carpetAreaSqft: p?.carpetAreaSqft?.toString() ?? "",
    facing: p?.facing ?? "",
    parkingAvailable: p?.parkingAvailable ?? false,
    liftAvailable: p?.liftAvailable ?? false,
    tenantPreference: p?.tenantPreference ?? "",
    availableFrom: p?.availableFrom ? new Date(p.availableFrom).toISOString().slice(0, 10) : "",
    amenities: p?.amenities ? JSON.parse(p.amenities) : [],
    pincode: p?.pincode ?? "",
    latitude: p?.latitude ?? null,
    longitude: p?.longitude ?? null,
    formattedAddress: p?.formattedAddress ?? "",
    placeId: p?.placeId ?? "",
    coverImage: p?.coverImage ?? "",
    videoUrl: p?.videoUrl ?? "",
    virtualTourUrl: p?.virtualTourUrl ?? "",
    inventorySource: (p?.inventorySource as "DIRECT" | "INDIRECT") ?? "DIRECT",
    partnerId: p?.partnerId ?? "",
    buildingName: p?.buildingName ?? "",
    flatNumber: p?.flatNumber ?? "",
    gateNumber: p?.gateNumber ?? "",
    propertySource: p?.propertySource ?? "",
    keyAvailability: p?.keyAvailability ?? "",
    entryInstructions: p?.entryInstructions ?? "",
    internalNotes: p?.internalNotes ?? "",
    negotiationNotes: p?.negotiationNotes ?? "",
    hiddenRemarks: p?.hiddenRemarks ?? "",
    ownerName: p?.ownerName ?? "",
    ownerPhone: p?.ownerPhone ?? "",
    ownerAlternatePhone: p?.ownerAlternatePhone ?? "",
    ownerNotes: p?.ownerNotes ?? "",
    commercialFitOut: p?.commercialFitOut ?? "",
    superAreaSqft: p?.superAreaSqft?.toString() ?? "", frontageFeet: p?.frontageFeet?.toString() ?? "", ceilingHeightFeet: p?.ceilingHeightFeet?.toString() ?? "", cabins: p?.cabins?.toString() ?? "", workstations: p?.workstations?.toString() ?? "", washrooms: p?.washrooms?.toString() ?? "", pantryAvailable: p?.pantryAvailable ?? false, goodsLiftAvailable: p?.goodsLiftAvailable ?? false, loadingAccessAvailable: p?.loadingAccessAvailable ?? false, powerLoadKw: p?.powerLoadKw?.toString() ?? "", suitableForTags: p?.suitableForTags ? JSON.parse(p.suitableForTags) : [], leaseTermMonths: p?.leaseTermMonths?.toString() ?? "", lockInPeriodMonths: p?.lockInPeriodMonths?.toString() ?? "", noticePeriodMonths: p?.noticePeriodMonths?.toString() ?? "", escalationPercentage: p?.escalationPercentage?.toString() ?? "", camCharge: p?.camCharge?.toString() ?? "",
  };
}

export function PropertyForm({ property, initialInventorySource, initialPartnerId }: { property?: Property; initialInventorySource?: "INDIRECT"; initialPartnerId?: string }) {
  const router = useRouter();
  const isEdit = !!property;
  const [submitting, setSubmitting] = useState(false);
  const defaults = toFormValues(property);
  if (!property && initialInventorySource) {
    defaults.inventorySource = initialInventorySource;
    defaults.partnerId = initialPartnerId ?? "";
  }
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({ defaultValues: defaults });
  const listingType = watch("listingType");
  const assetClass = watch("assetClass");
  const amenities = watch("amenities");
  const inventorySource = watch("inventorySource");
  const [partners, setPartners] = useState<{ id: string; name: string; company: string | null }[]>([]);

  useEffect(() => {
    if (inventorySource !== "INDIRECT") return;
    fetch("/api/inventory-partners?isActive=true&take=100")
      .then((res) => res.json())
      .then((data) => setPartners(data.inventoryPartners ?? []))
      .catch(() => {});
  }, [inventorySource]);

  function toggleAmenity(a: string) {
    setValue("amenities", amenities.includes(a) ? amenities.filter((x) => x !== a) : [...amenities, a]);
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim());
    const coverImage = blankToNull(values.coverImage);
    const payload = {
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      address: values.address.trim(),
      monthlyRent: values.monthlyRent ? Number(values.monthlyRent) : null,
      securityDeposit: values.securityDeposit ? Number(values.securityDeposit) : null,
      maintenanceCharge: values.maintenanceCharge ? Number(values.maintenanceCharge) : null,
      rentBrokerage: values.rentBrokerage ? Number(values.rentBrokerage) : null,
      salePrice: values.salePrice ? Number(values.salePrice) : null,
      pricePerSqft: values.pricePerSqft ? Number(values.pricePerSqft) : null,
      saleBrokeragePct: values.saleBrokeragePct ? Number(values.saleBrokeragePct) : null,
      bhk: assetClass === "RESIDENTIAL" ? Number(values.bhk) : 0,
      bathrooms: assetClass === "RESIDENTIAL" ? Number(values.bathrooms) : 0,
      balconies: Number(values.balconies),
      floorNumber: values.floorNumber ? Number(values.floorNumber) : null,
      totalFloors: values.totalFloors ? Number(values.totalFloors) : null,
      propertyAgeYears: values.propertyAgeYears ? Number(values.propertyAgeYears) : null,
      builtUpAreaSqft: Number(values.builtUpAreaSqft),
      carpetAreaSqft: values.carpetAreaSqft ? Number(values.carpetAreaSqft) : null,
      facing: values.facing || null,
      tenantPreference: values.tenantPreference || null,
      availableFrom: values.availableFrom || null,
      coverImage,
      images: coverImage ? [coverImage] : [],
      videoUrl: blankToNull(values.videoUrl),
      virtualTourUrl: blankToNull(values.virtualTourUrl),
      landmark: values.landmark.trim() === "" ? null : values.landmark.trim(),
      pincode: blankToNull(values.pincode),
      latitude: values.latitude,
      longitude: values.longitude,
      formattedAddress: values.formattedAddress || null,
      placeId: values.placeId || null,
      ownerName: values.inventorySource === "DIRECT" ? values.ownerName.trim() : null,
      ownerPhone: values.inventorySource === "DIRECT" ? values.ownerPhone.trim() : null,
      ownerAlternatePhone: values.inventorySource === "DIRECT" ? blankToNull(values.ownerAlternatePhone) : null,
      ownerNotes: values.inventorySource === "DIRECT" ? (values.ownerNotes.trim() === "" ? null : values.ownerNotes.trim()) : null,
      inventorySource: values.inventorySource,
      partnerId: values.inventorySource === "INDIRECT" ? (values.partnerId || null) : null,
      buildingName: blankToNull(values.buildingName),
      flatNumber: blankToNull(values.flatNumber),
      gateNumber: blankToNull(values.gateNumber),
      propertySource: blankToNull(values.propertySource),
      keyAvailability: blankToNull(values.keyAvailability),
      entryInstructions: blankToNull(values.entryInstructions),
      internalNotes: blankToNull(values.internalNotes),
      negotiationNotes: blankToNull(values.negotiationNotes),
      hiddenRemarks: blankToNull(values.hiddenRemarks),
      commercialFitOut: assetClass === "COMMERCIAL" ? values.commercialFitOut || null : null,
      superAreaSqft: values.superAreaSqft ? Number(values.superAreaSqft) : null, frontageFeet: values.frontageFeet ? Number(values.frontageFeet) : null, ceilingHeightFeet: values.ceilingHeightFeet ? Number(values.ceilingHeightFeet) : null, cabins: values.cabins ? Number(values.cabins) : null, workstations: values.workstations ? Number(values.workstations) : null, washrooms: values.washrooms ? Number(values.washrooms) : null, powerLoadKw: values.powerLoadKw ? Number(values.powerLoadKw) : null, suitableForTags: values.suitableForTags, leaseTermMonths: values.leaseTermMonths ? Number(values.leaseTermMonths) : null, lockInPeriodMonths: values.lockInPeriodMonths ? Number(values.lockInPeriodMonths) : null, noticePeriodMonths: values.noticePeriodMonths ? Number(values.noticePeriodMonths) : null, escalationPercentage: values.escalationPercentage ? Number(values.escalationPercentage) : null, camCharge: values.camCharge ? Number(values.camCharge) : null,
    };

    try {
      const res = await fetch(isEdit ? `/api/properties/${property!.id}` : "/api/properties", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        const issues = Array.isArray(err.issues) ? (err.issues as { path: (string | number)[]; message: string }[]) : [];
        if (issues.length > 0) {
          for (const issue of issues) {
            const field = issue.path[0];
            if (typeof field === "string" && field in values) {
              setError(field as keyof FormValues, { type: "server", message: issue.message });
            }
          }
          const summary = issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
          throw new Error(summary);
        }
        throw new Error(err.error ?? "Failed to save property");
      }
      const { property: saved } = await res.json();
      toast.success(isEdit ? "Property updated" : "Property added to inventory");
      router.push(`/properties/${saved.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Section title="Basic Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Property Title" required error={errors.title?.message}>
            <Input {...register("title", { required: "Title is required", minLength: { value: 3, message: "Title must be at least 3 characters" } })} placeholder="Spacious 2 BHK Apartment in Janakpuri" />
          </Field>
          <Field label="Property Type" required>
            <Select {...register("propertyType")}>
              {(assetClass === "COMMERCIAL" ? ["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL"] : ["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "STUDIO", "FARM_HOUSE", "PG", "CO_LIVING", "OTHER"]).map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Property Category" required><Select {...register("assetClass")}><option value="RESIDENTIAL">Residential</option><option value="COMMERCIAL">Commercial</option></Select></Field>
          <Field label="Available For" required>
            <Select {...register("listingType")}>
              <option value="RENT">Rent</option>
              <option value="SALE">Sale</option>
            </Select>
          </Field>
          <Field label="Status" required>
            <Select {...register("status")}>
              {["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" required error={errors.description?.message}>
          <Textarea rows={3} {...register("description", { required: "Description is required", minLength: { value: 10, message: "Description must be at least 10 characters" } })} placeholder="Describe the property..." />
        </Field>
      </Section>

      <Section title="Location">
        <Field label="Search Address" hint="Find and confirm a location - this never overwrites the fields below until you click &quot;Use this address&quot;.">
          <PropertyAddressSearch
            hasExistingLocation={watch("latitude") !== null}
            onApply={(location: AppliedLocation) => {
              setValue("latitude", location.latitude);
              setValue("longitude", location.longitude);
              setValue("formattedAddress", location.formattedAddress);
              setValue("placeId", location.placeId);
              toast.success("Location confirmed - review the address fields below before saving.");
            }}
            onClear={() => {
              setValue("latitude", null);
              setValue("longitude", null);
              setValue("formattedAddress", "");
              setValue("placeId", "");
            }}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Area / Locality" required error={errors.area?.message}>
            <input type="hidden" {...register("area", { required: "Area / Locality is required", minLength: { value: 2, message: "Enter a locality" } })} />
            <LocalityCombobox value={watch("area")} onChange={(name) => setValue("area", name, { shouldValidate: true })} aria-label="Search or add area / locality" />
          </Field>
          <Field label="Landmark">
            <Input {...register("landmark")} placeholder="Near Metro Station" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Complete Address" required error={errors.address?.message}>
            <Input {...register("address", { required: "Address is required", minLength: { value: 5, message: "Address must be at least 5 characters" } })} placeholder="House/Flat No, Street, Delhi" />
          </Field>
          <Field label="Pincode" error={errors.pincode?.message}>
            <Input
              {...register("pincode", {
                validate: (v) => v.trim() === "" || /^[0-9]{6}$/.test(v.trim()) || "Pincode must be a 6-digit number",
              })}
              placeholder="110058"
              maxLength={10}
            />
          </Field>
        </div>
        {watch("latitude") !== null && (
          <p className="flex items-center gap-1.5 text-xs text-[#1FA971]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1FA971]" /> Location confirmed ({watch("latitude")!.toFixed(5)}, {watch("longitude")!.toFixed(5)})
          </p>
        )}
      </Section>

      <Section title="Pricing">
        {listingType === "RENT" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Monthly Rent (₹)" required error={errors.monthlyRent?.message}>
              <Input type="number" {...register("monthlyRent", { required: "Rent amount is required", min: { value: 1, message: "Rent must be greater than 0" } })} />
            </Field>
            <Field label="Security Deposit (₹)">
              <Input type="number" {...register("securityDeposit")} />
            </Field>
            <Field label="Maintenance (₹/month)">
              <Input type="number" {...register("maintenanceCharge")} />
            </Field>
            <Field label="Brokerage (₹)">
              <Input type="number" {...register("rentBrokerage")} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Sale Price (₹)" required error={errors.salePrice?.message}>
              <Input type="number" {...register("salePrice", { required: "Sale price is required", min: { value: 1, message: "Sale price must be greater than 0" } })} />
            </Field>
            <Field label="Price per Sqft (₹)">
              <Input type="number" {...register("pricePerSqft")} />
            </Field>
            <Field label="Brokerage (%)">
              <Input type="number" step="0.1" {...register("saleBrokeragePct")} />
            </Field>
          </div>
        )}
        <Checkbox label="Price is negotiable" {...register("negotiable")} />
      </Section>

      <Section title="Property Details">
        {assetClass === "COMMERCIAL" ? <div className="space-y-4"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><Field label="Built-up Area (sqft)" required><Input type="number" {...register("builtUpAreaSqft", { required: "Area is required" })} /></Field><Field label="Carpet Area (sqft)"><Input type="number" {...register("carpetAreaSqft")} /></Field><Field label="Super Area (sqft)"><Input type="number" {...register("superAreaSqft")} /></Field><Field label="Fit-out"><Select {...register("commercialFitOut")}><option value="">Not specified</option><option value="FURNISHED">Furnished</option><option value="SEMI_FURNISHED">Semi-Furnished</option><option value="BARE_SHELL">Bare shell</option></Select></Field><Field label="Workstations"><Input type="number" {...register("workstations")} /></Field><Field label="Cabins"><Input type="number" {...register("cabins")} /></Field><Field label="Washrooms"><Input type="number" {...register("washrooms")} /></Field><Field label="Frontage (ft)"><Input type="number" {...register("frontageFeet")} /></Field><Field label="Power Load (kW)"><Input type="number" {...register("powerLoadKw")} /></Field></div><div className="flex flex-wrap gap-4"><Checkbox label="Parking available" {...register("parkingAvailable")} /><Checkbox label="Lift available" {...register("liftAvailable")} /><Checkbox label="Goods lift" {...register("goodsLiftAvailable")} /><Checkbox label="Pantry" {...register("pantryAvailable")} /><Checkbox label="Loading access" {...register("loadingAccessAvailable")} /></div></div> : <>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="BHK" required error={errors.bhk?.message}><Input type="number" {...register("bhk", { required: "BHK is required", min: { value: 0, message: "BHK must be 0-10" }, max: { value: 10, message: "BHK must be 0-10" } })} /></Field>
          <Field label="Bathrooms" required error={errors.bathrooms?.message}><Input type="number" {...register("bathrooms", { required: "Bathrooms required", min: { value: 0, message: "Bathrooms must be 0-10" }, max: { value: 10, message: "Bathrooms must be 0-10" } })} /></Field>
          <Field label="Balconies"><Input type="number" {...register("balconies")} /></Field>
          <Field label="Furnishing">
            <Select {...register("furnishing")}>
              <option value="FURNISHED">Furnished</option>
              <option value="SEMI_FURNISHED">Semi-Furnished</option>
              <option value="UNFURNISHED">Unfurnished</option>
            </Select>
          </Field>
          <Field label="Floor Number"><Input type="number" {...register("floorNumber")} /></Field>
          <Field label="Total Floors"><Input type="number" {...register("totalFloors")} /></Field>
          <Field label="Property Age (years)"><Input type="number" {...register("propertyAgeYears")} /></Field>
          <Field label="Built-up Area (sqft)" required error={errors.builtUpAreaSqft?.message}><Input type="number" {...register("builtUpAreaSqft", { required: "Area is required", min: { value: 1, message: "Built-up area must be greater than 0" } })} /></Field>
          <Field label="Carpet Area (sqft)"><Input type="number" {...register("carpetAreaSqft")} /></Field>
          <Field label="Facing">
            <Select {...register("facing")}>
              <option value="">Not specified</option>
              {["NORTH", "SOUTH", "EAST", "WEST", "NORTH_EAST", "NORTH_WEST", "SOUTH_EAST", "SOUTH_WEST"].map((f) => (
                <option key={f} value={f}>{f.replace("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tenant Preference">
            <Select {...register("tenantPreference")}>
              <option value="">Any</option>
              {["FAMILY", "BACHELOR_MALE", "BACHELOR_FEMALE", "COMPANY", "ANY"].map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Available From"><Input type="date" {...register("availableFrom")} /></Field>
        </div>
        <Checkbox label="Parking available" {...register("parkingAvailable")} />
        </>}
        <Field label="Amenities">
          <div className="flex flex-wrap gap-2">
            {AMENITIES_POOL.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => toggleAmenity(a)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all border ${
                  amenities.includes(a) ? "bg-[#3366FF] text-white border-[#3366FF]" : "bg-[#FAFBFC] text-[#596579] border-[#E7ECF2] hover:bg-[#F3F6FA]"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Media">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cover Image URL (legacy, optional)" hint="Only used as a fallback when no uploaded photos exist" error={errors.coverImage?.message}>
            <Input {...register("coverImage", { validate: (v) => v.trim() === "" || isValidUrl(v.trim()) || "Enter a valid URL" })} placeholder="https://..." />
          </Field>
          <Field label="Video URL" error={errors.videoUrl?.message}>
            <Input {...register("videoUrl", { validate: (v) => v.trim() === "" || isValidUrl(v.trim()) || "Enter a valid URL" })} placeholder="https://youtube.com/..." />
          </Field>
          <Field label="Virtual Tour URL" error={errors.virtualTourUrl?.message}>
            <Input {...register("virtualTourUrl", { validate: (v) => v.trim() === "" || isValidUrl(v.trim()) || "Enter a valid URL" })} placeholder="https://..." />
          </Field>
        </div>
      </Section>

      <Section title="Property Photos">
        {isEdit ? (
          <PropertyGallery propertyId={property!.id} propertyTitle={property!.title} legacyCoverImage={property!.coverImage} />
        ) : (
          <p className="text-sm text-[#8A94A6]">Save the property first, then you&apos;ll be able to upload and manage photos from its detail page.</p>
        )}
      </Section>

      <Section title="Inventory Source">
        <Field label="Is this property Direct or Indirect?" hint="Direct = you deal with the owner. Indirect = sourced through another company, dealer, builder, or society office.">
          <Select {...register("inventorySource")}>
            <option value="DIRECT">Direct (Owner)</option>
            <option value="INDIRECT">Indirect (Inventory Partner)</option>
          </Select>
        </Field>
      </Section>

      {inventorySource === "DIRECT" ? (
        <Section title="Owner Details (private, never shown publicly)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Owner Name" required error={errors.ownerName?.message}><Input {...register("ownerName", { required: "Owner name required", minLength: { value: 2, message: "Owner name must be at least 2 characters" } })} /></Field>
            <Field label="Owner Phone" required error={errors.ownerPhone?.message}><Input {...register("ownerPhone", { required: "Owner phone required", minLength: { value: 8, message: "Owner phone must be at least 8 characters" } })} /></Field>
            <Field label="Alternate Phone" error={errors.ownerAlternatePhone?.message}>
              <Input
                {...register("ownerAlternatePhone", {
                  validate: (v) => v.trim() === "" || /^[0-9+\-\s()]{7,20}$/.test(v.trim()) || "Alternate phone must contain digits only",
                })}
              />
            </Field>
            <Field label="Owner Notes"><Input {...register("ownerNotes")} /></Field>
          </div>
        </Section>
      ) : (
        <Section title="Inventory Partner (private, never shown publicly)">
          <Field label="Partner" required error={errors.partnerId?.message}>
            <Select {...register("partnerId", { required: inventorySource === "INDIRECT" ? "An inventory partner is required for indirect inventory" : false })}>
              <option value="">Select an inventory partner...</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.company ? ` (${p.company})` : ""}</option>
              ))}
            </Select>
          </Field>
          {partners.length === 0 && (
            <p className="mt-1 text-xs text-[#8A94A6]">No active inventory partners yet - <Link href="/inventory-partners/new" className="text-[#3366FF] hover:underline">add one first</Link>.</p>
          )}
        </Section>
      )}

      <Section title="Internal Property View (staff only, never shown publicly)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Building Name"><Input {...register("buildingName")} /></Field>
          <Field label="Flat / Unit Number"><Input {...register("flatNumber")} /></Field>
          <Field label="Gate Number"><Input {...register("gateNumber")} /></Field>
          <Field label="Property Source" hint="e.g. Referral, Cold call, Portal, Partner network"><Input {...register("propertySource")} /></Field>
          <Field label="Key Availability" hint="e.g. With owner, With partner, Office key box #4"><Input {...register("keyAvailability")} /></Field>
        </div>
        <Field label="Entry Instructions"><Textarea rows={2} {...register("entryInstructions")} /></Field>
        <Field label="Internal Notes"><Textarea rows={2} {...register("internalNotes")} /></Field>
        <Field label="Negotiation Notes"><Textarea rows={2} {...register("negotiationNotes")} /></Field>
        <Field label="Hidden Remarks"><Textarea rows={2} {...register("hiddenRemarks")} /></Field>
      </Section>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#EFF4FF]">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={submitting}>{isEdit ? "Save Changes" : "Add Property"}</Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

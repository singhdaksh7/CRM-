"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { Property } from "@prisma/client";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PropertyGallery } from "@/components/properties/property-gallery";
import { PropertyAddressSearch, type AppliedLocation } from "@/components/properties/property-address-search";

const AREAS = ["Janakpuri", "Dwarka", "Rajouri Garden", "Uttam Nagar", "Rohini", "Pitampura", "Vasant Kunj", "Saket", "Greater Kailash", "Lajpat Nagar", "Karol Bagh", "Paschim Vihar"];
const AMENITIES_POOL = ["Lift", "Power Backup", "24x7 Security", "Swimming Pool", "Gym", "Club House", "Children's Play Area", "Covered Parking", "CCTV", "Park Facing", "Modular Kitchen", "Water Storage"];

type FormValues = {
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
};

function toFormValues(p?: Property): FormValues {
  return {
    title: p?.title ?? "",
    propertyType: p?.propertyType ?? "APARTMENT",
    listingType: (p?.listingType as "RENT" | "SALE") ?? "RENT",
    status: p?.status ?? "AVAILABLE",
    description: p?.description ?? "",
    area: p?.area ?? AREAS[0],
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
    ownerName: p?.ownerName ?? "",
    ownerPhone: p?.ownerPhone ?? "",
    ownerAlternatePhone: p?.ownerAlternatePhone ?? "",
    ownerNotes: p?.ownerNotes ?? "",
  };
}

export function PropertyForm({ property }: { property?: Property }) {
  const router = useRouter();
  const isEdit = !!property;
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({ defaultValues: toFormValues(property) });
  const listingType = watch("listingType");
  const amenities = watch("amenities");

  function toggleAmenity(a: string) {
    setValue("amenities", amenities.includes(a) ? amenities.filter((x) => x !== a) : [...amenities, a]);
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const payload = {
      ...values,
      monthlyRent: values.monthlyRent ? Number(values.monthlyRent) : null,
      securityDeposit: values.securityDeposit ? Number(values.securityDeposit) : null,
      maintenanceCharge: values.maintenanceCharge ? Number(values.maintenanceCharge) : null,
      rentBrokerage: values.rentBrokerage ? Number(values.rentBrokerage) : null,
      salePrice: values.salePrice ? Number(values.salePrice) : null,
      pricePerSqft: values.pricePerSqft ? Number(values.pricePerSqft) : null,
      saleBrokeragePct: values.saleBrokeragePct ? Number(values.saleBrokeragePct) : null,
      bhk: Number(values.bhk),
      bathrooms: Number(values.bathrooms),
      balconies: Number(values.balconies),
      floorNumber: values.floorNumber ? Number(values.floorNumber) : null,
      totalFloors: values.totalFloors ? Number(values.totalFloors) : null,
      propertyAgeYears: values.propertyAgeYears ? Number(values.propertyAgeYears) : null,
      builtUpAreaSqft: Number(values.builtUpAreaSqft),
      carpetAreaSqft: values.carpetAreaSqft ? Number(values.carpetAreaSqft) : null,
      facing: values.facing || null,
      tenantPreference: values.tenantPreference || null,
      availableFrom: values.availableFrom || null,
      images: values.coverImage ? [values.coverImage] : [],
      landmark: values.landmark || null,
      pincode: values.pincode || null,
      latitude: values.latitude,
      longitude: values.longitude,
      formattedAddress: values.formattedAddress || null,
      placeId: values.placeId || null,
      ownerAlternatePhone: values.ownerAlternatePhone || null,
      ownerNotes: values.ownerNotes || null,
    };

    try {
      const res = await fetch(isEdit ? `/api/properties/${property!.id}` : "/api/properties", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
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
          <Field label="Property Title" required error={errors.title ? "Title is required" : undefined}>
            <Input {...register("title", { required: true })} placeholder="Spacious 2 BHK Apartment in Janakpuri" />
          </Field>
          <Field label="Property Type" required>
            <Select {...register("propertyType")}>
              {["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE", "PG"].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Listing Type" required>
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
        <Field label="Description" required error={errors.description ? "Description is required" : undefined}>
          <Textarea rows={3} {...register("description", { required: true })} placeholder="Describe the property..." />
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
          <Field label="Area / Locality" required>
            <Select {...register("area")}>
              {AREAS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="Landmark">
            <Input {...register("landmark")} placeholder="Near Metro Station" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Complete Address" required error={errors.address ? "Address is required" : undefined}>
            <Input {...register("address", { required: true })} placeholder="House/Flat No, Street, Delhi" />
          </Field>
          <Field label="Pincode">
            <Input {...register("pincode")} placeholder="110058" maxLength={10} />
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
            <Field label="Monthly Rent (₹)" required error={errors.monthlyRent ? "Rent amount is required" : undefined}>
              <Input type="number" {...register("monthlyRent", { required: true })} />
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
            <Field label="Sale Price (₹)" required error={errors.salePrice ? "Sale price is required" : undefined}>
              <Input type="number" {...register("salePrice", { required: true })} />
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="BHK" required error={errors.bhk ? "BHK is required" : undefined}><Input type="number" {...register("bhk", { required: true })} /></Field>
          <Field label="Bathrooms" required error={errors.bathrooms ? "Bathrooms required" : undefined}><Input type="number" {...register("bathrooms", { required: true })} /></Field>
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
          <Field label="Built-up Area (sqft)" required error={errors.builtUpAreaSqft ? "Area is required" : undefined}><Input type="number" {...register("builtUpAreaSqft", { required: true })} /></Field>
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
          <Field label="Cover Image URL (legacy, optional)" hint="Only used as a fallback when no uploaded photos exist">
            <Input {...register("coverImage")} placeholder="https://..." />
          </Field>
          <Field label="Video URL"><Input {...register("videoUrl")} placeholder="https://youtube.com/..." /></Field>
          <Field label="Virtual Tour URL"><Input {...register("virtualTourUrl")} placeholder="https://..." /></Field>
        </div>
      </Section>

      <Section title="Property Photos">
        {isEdit ? (
          <PropertyGallery propertyId={property!.id} propertyTitle={property!.title} legacyCoverImage={property!.coverImage} />
        ) : (
          <p className="text-sm text-[#8A94A6]">Save the property first, then you&apos;ll be able to upload and manage photos from its detail page.</p>
        )}
      </Section>

      <Section title="Owner Details (private, never shown publicly)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Owner Name" required error={errors.ownerName ? "Owner name required" : undefined}><Input {...register("ownerName", { required: true })} /></Field>
          <Field label="Owner Phone" required error={errors.ownerPhone ? "Owner phone required" : undefined}><Input {...register("ownerPhone", { required: true })} /></Field>
          <Field label="Alternate Phone"><Input {...register("ownerAlternatePhone")} /></Field>
          <Field label="Owner Notes"><Input {...register("ownerNotes")} /></Field>
        </div>
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

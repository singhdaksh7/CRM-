"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Star, Trash2, ArrowUp, ArrowDown, Pencil, RefreshCw, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/states";
import { PropertyImageUploader } from "@/components/properties/property-image-uploader";
import { useStorageCapabilities } from "@/components/storage/use-storage-capabilities";
import { cn } from "@/lib/utils";

interface GalleryImage {
  id: string;
  url: string;
  caption: string | null;
  isCover: boolean;
  purpose: "IMAGE" | "FLOOR_PLAN";
  sortOrder: number;
}

export function PropertyGallery({ propertyId, propertyTitle, legacyCoverImage }: { propertyId: string; propertyTitle: string; legacyCoverImage: string | null }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "DATA_MANAGER";
  const canUpload = canManage || role === "FIELD_EXECUTIVE";
  const { capabilities } = useStorageCapabilities();

  const [images, setImages] = useState<GalleryImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [captionDraftId, setCaptionDraftId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  const load = useCallback(() => {
    fetch(`/api/properties/${propertyId}/images`)
      .then((res) => {
        if (!res.ok) throw new Error("unavailable");
        return res.json();
      })
      .then((data) => setImages(data.images))
      .catch(() => setError("Could not load images."));
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeImages = (images ?? []).filter((i) => i.purpose === "IMAGE");
  const floorPlans = (images ?? []).filter((i) => i.purpose === "FLOOR_PLAN");
  const cover = activeImages.find((i) => i.isCover) ?? activeImages[0];

  async function setCover(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/property-images/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isCover: true }) });
    setBusyId(null);
    if (res.ok) {
      toast.success("Cover image updated");
      load();
    } else {
      toast.error("Could not update cover image");
    }
  }

  async function removeImage(id: string) {
    if (!confirm("Remove this image? It will no longer appear on the property or public catalogue.")) return;
    setBusyId(id);
    const res = await fetch(`/api/property-images/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) {
      toast.success("Image removed");
      load();
    } else {
      toast.error("Could not remove image");
    }
  }

  async function saveCaption(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/property-images/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: captionDraft }) });
    setBusyId(null);
    setCaptionDraftId(null);
    if (res.ok) {
      toast.success("Caption updated");
      load();
    } else {
      toast.error("Could not update caption");
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const ordered = [...activeImages].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((i) => i.id === id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
    const order = ordered.map((i) => i.id);
    setBusyId(id);
    const res = await fetch(`/api/properties/${propertyId}/images/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
    setBusyId(null);
    if (res.ok) {
      const data = await res.json();
      setImages(data.images);
    } else {
      toast.error("Could not save new order");
    }
  }

  async function replaceImage(id: string, file: File) {
    setBusyId(id);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/property-images/${id}/replace`, { method: "POST", body: form });
    setBusyId(null);
    if (res.ok) {
      toast.success("Image replaced");
      load();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Replacement failed - the original image was kept");
    }
  }

  if (error) {
    return (
      <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-[#E7ECF2] bg-[#FAFBFC] sm:h-96 flex items-center justify-center text-sm text-[#8A94A6]">
        Image gallery is unavailable right now.
      </div>
    );
  }

  if (images === null) {
    return (
      <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-[#E7ECF2] bg-[#FAFBFC] sm:h-96">
        <LoadingState label="Loading gallery..." />
      </div>
    );
  }

  const heroSrc = cover?.url ?? legacyCoverImage;
  const orderedActive = [...activeImages].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3">
      <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-[#E7ECF2] bg-[#FAFBFC] sm:h-96">
        {heroSrc ? (
          <button type="button" className="absolute inset-0 h-full w-full cursor-zoom-in" onClick={() => setLightboxIndex(0)} aria-label="View full-screen gallery">
            <Image src={heroSrc} alt={propertyTitle} fill sizes="(max-width: 1024px) 100vw, 66vw" className="object-cover" unoptimized />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-[#8A94A6]">No photo uploaded for this property</div>
        )}
        {activeImages.length > 0 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{activeImages.length} photo{activeImages.length > 1 ? "s" : ""}</span>
        )}
      </div>

      {orderedActive.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Image thumbnails">
          {orderedActive.map((img, idx) => (
            <div key={img.id} role="listitem" className="group relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-[#E7ECF2] bg-[#FAFBFC]">
              <button type="button" onClick={() => setLightboxIndex(idx)} className="h-full w-full" aria-label={`View photo ${idx + 1}${img.caption ? `: ${img.caption}` : ""}`}>
                <Image src={img.url} alt={img.caption ?? `${propertyTitle} photo ${idx + 1}`} fill sizes="80px" className="object-cover" unoptimized />
              </button>
              {img.isCover && (
                <span className="absolute left-0.5 top-0.5 rounded bg-[#3366FF] px-1 text-[9px] font-bold text-white">Cover</span>
              )}
              {canManage && (
                <div className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-0.5 bg-black/70 py-0.5 group-hover:flex group-focus-within:flex">
                  <IconBtn label="Move left" onClick={() => move(img.id, -1)} disabled={busyId === img.id || idx === 0}>
                    <ArrowUp className="h-3 w-3 -rotate-90" />
                  </IconBtn>
                  <IconBtn label="Set as cover" onClick={() => setCover(img.id)} disabled={busyId === img.id}>
                    <Star className="h-3 w-3" fill={img.isCover ? "currentColor" : "none"} />
                  </IconBtn>
                  <IconBtn label="Remove image" onClick={() => removeImage(img.id)} disabled={busyId === img.id}>
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn label="Move right" onClick={() => move(img.id, 1)} disabled={busyId === img.id || idx === orderedActive.length - 1}>
                    <ArrowDown className="h-3 w-3 -rotate-90" />
                  </IconBtn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {floorPlans.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#8A94A6]">
          <LayoutGrid className="h-3.5 w-3.5" /> {floorPlans.length} floor plan{floorPlans.length > 1 ? "s" : ""} attached
        </div>
      )}

      {canManage && orderedActive.length > 0 && (
        <ul className="space-y-1.5">
          {orderedActive.map((img) => (
            <li key={img.id} className="flex items-center gap-2 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] px-2.5 py-1.5 text-xs">
              {captionDraftId === img.id ? (
                <>
                  <input
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    aria-label="Edit caption"
                    className="flex-1 rounded-lg border border-[#E7ECF2] bg-white px-2 py-1 text-xs text-[#1B2430]"
                  />
                  <button className="text-[#3366FF] font-semibold" onClick={() => saveCaption(img.id)} disabled={busyId === img.id}>Save</button>
                  <button className="text-[#8A94A6]" onClick={() => setCaptionDraftId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-[#596579]">{img.caption || <span className="text-[#8A94A6]">No caption</span>}</span>
                  <button
                    className="flex items-center gap-1 text-[#8A94A6] hover:text-[#1B2430]"
                    onClick={() => {
                      setCaptionDraftId(img.id);
                      setCaptionDraft(img.caption ?? "");
                    }}
                    aria-label="Edit caption"
                  >
                    <Pencil className="h-3 w-3" /> Caption
                  </button>
                  <label className="flex cursor-pointer items-center gap-1 text-[#8A94A6] hover:text-[#1B2430]">
                    <RefreshCw className="h-3 w-3" /> Replace
                    <input
                      type="file"
                      accept={capabilities?.propertyImages.allowedMimeTypes.join(",")}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) replaceImage(img.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowUploader((v) => !v)}>
            {showUploader ? "Hide uploader" : "Upload Images"}
          </Button>
          {showUploader && (
            <div className="mt-3 rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
              <PropertyImageUploader propertyId={propertyId} onUploaded={load} />
            </div>
          )}
        </div>
      )}

      {lightboxIndex !== null && orderedActive.length > 0 && (
        <Dialog open onClose={() => setLightboxIndex(null)} title={propertyTitle} wide>
          <div className="relative">
            <div className="relative h-[60vh] w-full">
              <Image src={orderedActive[lightboxIndex]?.url ?? heroSrc ?? ""} alt={orderedActive[lightboxIndex]?.caption ?? propertyTitle} fill className="object-contain" unoptimized />
            </div>
            {orderedActive[lightboxIndex]?.caption && <p className="mt-2 text-center text-sm text-[#596579]">{orderedActive[lightboxIndex].caption}</p>}
            <div className="mt-3 flex items-center justify-between">
              <Button type="button" variant="secondary" size="sm" onClick={() => setLightboxIndex((i) => (i !== null ? Math.max(0, i - 1) : 0))} disabled={lightboxIndex === 0}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-xs text-[#8A94A6]">{lightboxIndex + 1} / {orderedActive.length}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setLightboxIndex((i) => (i !== null ? Math.min(orderedActive.length - 1, i + 1) : 0))} disabled={lightboxIndex === orderedActive.length - 1}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cn("rounded p-1 text-white hover:bg-white/20 disabled:opacity-40")}>
      {children}
    </button>
  );
}

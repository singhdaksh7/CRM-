import { prisma } from "./prisma";
import { activeStorageProviderName, isStorageConfigured } from "./storage";

export interface StorageUsageSummary {
  provider: string;
  configured: boolean;
  images: { count: number; bytes: number };
  documents: { count: number; bytes: number };
  pendingUploads: number;
  totalBytes: number;
}

/** DB-metadata aggregation only - never scans the bucket. */
export async function getStorageUsageSummary(organizationId: string): Promise<StorageUsageSummary> {
  const [imageAgg, documentAgg, pendingUploads] = await Promise.all([
    prisma.propertyImage.aggregate({
      where: { organizationId, status: "ACTIVE" },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.document.aggregate({
      where: { organizationId, status: "ACTIVE", storageKey: { not: null } },
      _count: { _all: true },
      _sum: { fileSizeBytes: true },
    }),
    prisma.storageUploadSession.count({
      where: { organizationId, status: { in: ["PENDING", "UPLOADED"] } },
    }),
  ]);

  const imageBytes = imageAgg._sum.sizeBytes ?? 0;
  const documentBytes = documentAgg._sum.fileSizeBytes ?? 0;

  return {
    provider: activeStorageProviderName(),
    configured: isStorageConfigured(),
    images: { count: imageAgg._count._all, bytes: imageBytes },
    documents: { count: documentAgg._count._all, bytes: documentBytes },
    pendingUploads,
    totalBytes: imageBytes + documentBytes,
  };
}

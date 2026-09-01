/** TEMPORARY PERFORMANCE DIAGNOSTIC — remove before a production merge. */
import { synchronizePreviewPerformanceAdmin } from "../src/lib/preview-performance-admin";

synchronizePreviewPerformanceAdmin()
  .then((result) => {
    // Deliberately emits only a fixed status, never an email, password, hash,
    // database detail, or any other credential material.
    console.log(JSON.stringify({ event: "preview_performance_admin_sync", result }));
  })
  .catch(() => {
    console.error(JSON.stringify({ event: "preview_performance_admin_sync_failed" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });

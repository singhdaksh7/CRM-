// Removes every row and R2 object created by qa-commercial-run.cjs, scoped strictly to the QA
// run id (ids captured in /tmp/kp-qa/commercial-ids.json, plus a by-name sweep for anything
// tagged with QA_RUN_ID that a failed step might not have recorded). The app has no hard-delete
// API for leads/properties/catalogues (soft lifecycle only), so these QA-only rows are removed
// with direct Prisma deletes - never anything outside the run id. The QA admin user itself is
// removed afterwards by qa-admin-cleanup.cjs. Ends with a leftover sweep and the lead count.
"use strict";
const fs = require("node:fs");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require("/app/node_modules/@aws-sdk/client-s3");
const prisma = new PrismaClient();
const RUN_ID = process.env.QA_RUN_ID;
const report = [];
function log(step, ok, detail) { report.push({ step, ok, detail }); console.log(`[${ok ? "OK" : "FAIL"}] ${step}${detail ? " - " + detail : ""}`); }

async function main() {
  if (!RUN_ID || !/^QA-\d{8}-[0-9a-f]{6,}$/.test(RUN_ID)) throw new Error("QA_RUN_ID missing or not a QA-<date>-<hex> id - refusing to run");
  let ids = { propertyIds: [], leadIds: [], requirementIds: [], catalogueIds: [] };
  try { ids = { ...ids, ...JSON.parse(fs.readFileSync("/tmp/kp-qa/commercial-ids.json", "utf8")) }; } catch {}

  // Union recorded ids with anything tagged by name, so a step that died before saving its id
  // is still found. Every by-name match must contain the run id.
  const taggedProps = await prisma.property.findMany({ where: { OR: [{ title: { contains: RUN_ID } }, { area: { contains: RUN_ID } }] }, select: { id: true, title: true } });
  const taggedLeads = await prisma.lead.findMany({ where: { clientName: { contains: RUN_ID } }, select: { id: true } });
  const taggedCats = await prisma.catalogueShare.findMany({ where: { title: { contains: RUN_ID } }, select: { id: true } });
  const propertyIds = [...new Set([...ids.propertyIds, ...taggedProps.map((p) => p.id)])];
  const leadIds = [...new Set([...ids.leadIds, ...taggedLeads.map((l) => l.id)])];
  const catalogueIds = [...new Set([...ids.catalogueIds, ...taggedCats.map((c) => c.id)])];
  // Safety: every recorded property must actually be a QA row.
  const recorded = await prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, title: true, area: true } });
  const foreign = recorded.filter((p) => !p.title.includes(RUN_ID) && !p.area.includes(RUN_ID));
  if (foreign.length) throw new Error(`refusing: ${foreign.length} recorded property id(s) are not tagged with the run id`);
  const recordedLeads = await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, clientName: true } });
  if (recordedLeads.some((l) => !l.clientName.includes(RUN_ID))) throw new Error("refusing: a recorded lead is not tagged with the run id");
  log("scope resolved", true, `properties=${propertyIds.length} leads=${leadIds.length} catalogues=${catalogueIds.length}`);

  // 1) R2 objects: every key under a QA property id (images, thumbnails, abandoned uploads).
  const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const allKeys = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, ContinuationToken: token }));
    for (const o of page.Contents || []) allKeys.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const sessionKeys = (await prisma.storageUploadSession.findMany({ where: { entityId: { in: propertyIds } }, select: { objectKey: true } })).map((s) => s.objectKey);
  const imageKeys = (await prisma.propertyImage.findMany({ where: { propertyId: { in: propertyIds } }, select: { storageKey: true, thumbnailKey: true } })).flatMap((i) => [i.storageKey, i.thumbnailKey]).filter(Boolean);
  const qaKeys = [...new Set([...allKeys.filter((k) => propertyIds.some((pid) => k.includes(`/${pid}/`))), ...sessionKeys, ...imageKeys])].filter((k) => allKeys.includes(k));
  for (const key of qaKeys) await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  log("R2 objects deleted", true, `${qaKeys.length} object(s)`);

  // 2) Rows. Order respects FKs; cascades handle requirement/locality joins, activities,
  // catalogue share properties/interactions, timeline events, images.
  const del = async (label, model, where) => { const r = await prisma[model].deleteMany({ where }); log(label, true, `${r.count} row(s)`); };
  await del("notifications", "notification", { OR: [{ leadId: { in: leadIds } }, { propertyId: { in: propertyIds } }, { title: { contains: RUN_ID } }, { message: { contains: RUN_ID } }] });
  await del("catalogue shares (cascade: properties/interactions/versions)", "catalogueShare", { id: { in: catalogueIds } });
  await del("match recommendations", "matchRecommendation", { OR: [{ leadId: { in: leadIds } }, { propertyId: { in: propertyIds } }] });
  await del("property recommendations", "propertyRecommendation", { OR: [{ leadId: { in: leadIds } }, { propertyId: { in: propertyIds } }] });
  await del("leads (cascade: requirements, activities)", "lead", { id: { in: leadIds } });
  await del("storage upload sessions", "storageUploadSession", { entityId: { in: propertyIds } });
  await del("property images", "propertyImage", { propertyId: { in: propertyIds } });
  await del("properties (cascade: timeline/view logs)", "property", { id: { in: propertyIds } });
  await del("QA localities", "propertyLocality", { name: { contains: RUN_ID } });
  const qaUser = await prisma.user.findFirst({ where: { email: `${RUN_ID.toLowerCase()}@kpproperties.local` }, select: { id: true } });
  const auditIds = [...propertyIds, ...leadIds, ...catalogueIds, ...(ids.requirementIds || [])];
  await del("audit log rows for QA entities / QA admin", "auditLog", { OR: [{ entityId: { in: auditIds } }, ...(qaUser ? [{ userId: qaUser.id }] : [])] });
  if (qaUser) await del("activities authored by the QA admin", "activity", { actorId: qaUser.id });

  // 3) Final sweep - nothing tagged or referencing a QA id may remain.
  const sweep = {
    properties: await prisma.property.count({ where: { OR: [{ id: { in: propertyIds } }, { title: { contains: RUN_ID } }, { area: { contains: RUN_ID } }] } }),
    leads: await prisma.lead.count({ where: { OR: [{ id: { in: leadIds } }, { clientName: { contains: RUN_ID } }] } }),
    leadRequirements: await prisma.leadRequirement.count({ where: { OR: [{ leadId: { in: leadIds } }, { notes: { contains: RUN_ID } }] } }),
    catalogues: await prisma.catalogueShare.count({ where: { OR: [{ id: { in: catalogueIds } }, { title: { contains: RUN_ID } }] } }),
    propertyImages: await prisma.propertyImage.count({ where: { propertyId: { in: propertyIds } } }),
    uploadSessions: await prisma.storageUploadSession.count({ where: { entityId: { in: propertyIds } } }),
    localities: await prisma.propertyLocality.count({ where: { name: { contains: RUN_ID } } }),
    notifications: await prisma.notification.count({ where: { OR: [{ leadId: { in: leadIds } }, { propertyId: { in: propertyIds } }, { message: { contains: RUN_ID } }] } }),
    propertyRecommendations: await prisma.propertyRecommendation.count({ where: { OR: [{ leadId: { in: leadIds } }, { propertyId: { in: propertyIds } }] } }),
    matchRecommendations: await prisma.matchRecommendation.count({ where: { OR: [{ leadId: { in: leadIds } }, { propertyId: { in: propertyIds } }] } }),
    activities: await prisma.activity.count({ where: { OR: [{ leadId: { in: leadIds } }, { description: { contains: RUN_ID } }] } }),
    auditLogs: await prisma.auditLog.count({ where: { entityId: { in: auditIds } } }),
  };
  const leftover = Object.entries(sweep).filter(([, n]) => n > 0);
  log("final sweep: zero QA rows remain", leftover.length === 0, JSON.stringify(sweep));
  const r2Left = allKeys.length - qaKeys.length;
  log("R2 objects remaining in bucket after QA deletes", true, String(r2Left));
  const leadCount = await prisma.lead.count();
  log("production lead count", leadCount === 0, String(leadCount));

  fs.writeFileSync("/tmp/kp-qa/commercial-cleanup-report.json", JSON.stringify(report, null, 2));
  const fails = report.filter((r) => !r.ok);
  console.log(`\n=== CLEANUP SUMMARY === ${report.length - fails.length}/${report.length} ok`);
  if (fails.length) { console.log("FAILED:", fails.map((f) => f.step).join(", ")); process.exitCode = 1; }
}
main().catch((e) => { console.error("FATAL:", e.stack || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

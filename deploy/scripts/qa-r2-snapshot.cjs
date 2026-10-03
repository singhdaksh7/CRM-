// Read-only R2 bucket snapshot for QA before/after comparison: object count, total bytes,
// per-prefix counts and a sha256 over the sorted key list. Never prints credentials or object
// contents. Usage (inside kp-crm): QA_SNAPSHOT_LABEL=before node qa-r2-snapshot.cjs
// Writes /tmp/kp-qa/r2-<label>.json; compare two snapshots by their keyListSha256.
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const { S3Client, ListObjectsV2Command } = require("/app/node_modules/@aws-sdk/client-s3");

async function main() {
  const label = process.env.QA_SNAPSHOT_LABEL || "snapshot";
  const c = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const keys = [];
  let totalBytes = 0;
  let token;
  do {
    const page = await c.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, ContinuationToken: token }));
    for (const o of page.Contents || []) { keys.push(o.Key); totalBytes += o.Size || 0; }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  keys.sort();
  const prefixes = {};
  for (const k of keys) {
    const p = k.split("/").slice(0, 3).join("/");
    prefixes[p] = (prefixes[p] || 0) + 1;
  }
  const runId = process.env.QA_RUN_ID;
  const snapshot = {
    label,
    takenAt: new Date().toISOString(),
    objectCount: keys.length,
    totalBytes,
    prefixes,
    keyListSha256: crypto.createHash("sha256").update(keys.join("\n")).digest("hex"),
    keysContainingRunId: runId ? keys.filter((k) => k.includes(runId) || k.includes(runId.toLowerCase())).length : null,
  };
  fs.mkdirSync("/tmp/kp-qa", { recursive: true });
  fs.writeFileSync(`/tmp/kp-qa/r2-${label}.json`, JSON.stringify({ ...snapshot, keys }, null, 2));
  console.log(JSON.stringify(snapshot));
}

main().catch((e) => { console.error("ERROR:", e && e.message ? e.message : e); process.exitCode = 1; });

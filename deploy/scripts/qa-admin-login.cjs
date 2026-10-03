// Creates one temporary ADMIN user tagged with the QA run id, logs it in through the
// application's real NextAuth credentials endpoint (CSRF token -> signin, exactly what the
// /login page does), and writes the resulting session cookie to a root-only file for reuse by
// QA API calls. The random password lives only in this process's memory; it is never logged,
// printed, or written to disk. Run once; qa-admin-cleanup.cjs removes the user afterwards.
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const bcrypt = require("/tmp/kp-qa/node_modules/bcryptjs");

const RUN_ID = process.env.QA_RUN_ID;
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const COOKIE_FILE = "/tmp/kp-qa/session.cookie";
const USERID_FILE = "/tmp/kp-qa/qa-user-id.txt";
const prisma = new PrismaClient();

function die(msg) {
  console.error("ABORT:", msg);
  process.exit(1);
}

async function main() {
  if (!RUN_ID) die("QA_RUN_ID not set");
  const email = `${RUN_ID.toLowerCase()}@kpproperties.local`;
  const name = `${RUN_ID} Temp QA Admin`;
  const password = crypto.randomBytes(24).toString("base64url"); // never printed/logged

  const org = await prisma.organization.findUnique({ where: { id: "org_default" } });
  if (!org) die("org_default not found");

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  let user;
  if (existing) {
    if (existing.role !== "ADMIN") die(`existing user ${email} is not ADMIN, refusing to touch it`);
    // Re-run: rotate its password to the new random value (it was never recoverable anyway)
    // rather than failing, so this step can be safely retried.
    user = await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, status: "ACTIVE", authVersion: { increment: 1 } } });
    console.log("QA admin already existed - rotated its password:", email, user.id);
  } else {
    user = await prisma.user.create({
      data: { organizationId: org.id, name, email, passwordHash, role: "ADMIN", status: "ACTIVE" },
    });
    console.log("QA admin created:", email, user.id);
  }
  fs.writeFileSync(USERID_FILE, user.id, { mode: 0o600 });

  // Real login through the app's own Auth.js credentials flow - same two requests the
  // /login page performs: fetch a CSRF token, then POST signin with it.
  // AUTH_TRUST_HOST=true means Auth.js derives the trusted origin from the request's
  // Host header - it must match NEXTAUTH_URL's host, not the container-internal one.
  const publicHost = new URL(process.env.NEXTAUTH_URL || BASE_URL).host;
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, { headers: { host: publicHost } });
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) die("could not obtain CSRF token");
  // Auth.js can set the csrf-token cookie more than once per response; the JSON body's
  // token always matches the LAST one, so take the cookie jar's last matching entry.
  const csrfSetCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get("set-cookie")].filter(Boolean);
  const byName = new Map();
  for (const c of csrfSetCookies) {
    const kv = c.split(";")[0];
    const name = kv.split("=")[0];
    byName.set(name, kv); // later entries overwrite earlier ones, matching what the server will see last
  }
  const cookieHeader = [...byName.values()].join("; ");

  const body = new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE_URL}/dashboard`, json: "true" });
  const signinRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader,
      host: publicHost,
    },
    body,
    redirect: "manual",
  });

  const setCookies = signinRes.headers.getSetCookie ? signinRes.headers.getSetCookie() : [signinRes.headers.get("set-cookie")].filter(Boolean);
  const sessionCookie = setCookies.map((c) => c.split(";")[0]).filter((c) => /session-token/i.test(c)).join("; ");
  if (!sessionCookie) {
    console.error("login status:", signinRes.status, "location:", signinRes.headers.get("location"));
    die("login did not return a session cookie");
  }

  fs.writeFileSync(COOKIE_FILE, sessionCookie, { mode: 0o600 });
  console.log("login status:", signinRes.status, "- session cookie written to", COOKIE_FILE, "(not printed)");

  // Prove it's a real, working authenticated session without printing it.
  const whoami = await fetch(`${BASE_URL}/api/auth/session`, { headers: { cookie: sessionCookie } });
  const session = await whoami.json();
  console.log("session check: email matches =", session?.user?.email === email, "role =", session?.user?.role);
}

main()
  .catch((e) => {
    console.error("ERROR:", e && e.message ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import 'dotenv/config';
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import path from "path";

async function main() {
  const p = new PrismaClient();
  const user = await p.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } });
  const prop = await p.property.findFirst();
  if (!user || !prop) throw new Error("Missing user or prop");

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const sessionToken = await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      authVersion: user.authVersion,
      organizationId: user.organizationId,
      sub: user.id,
    },
    secret,
    salt: "authjs.session-token",
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      url: "http://localhost:3340",
    },
  ]);

  const page = await context.newPage();
  console.log("Navigating to property detail:", `/properties/${prop.id}`);
  await page.goto(`http://localhost:3340/properties/${prop.id}`, { waitUntil: "networkidle", timeout: 45000 });
  const propDetailPath = path.join(process.cwd(), "public", "screenshots", "property-detail-1440.png");
  await page.screenshot({ path: propDetailPath, fullPage: false });
  console.log("Saved property detail screenshot to", propDetailPath);

  await browser.close();
  await p.$disconnect();
}

main().catch(console.error);

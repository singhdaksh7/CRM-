import 'dotenv/config';
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

async function main() {
  const p = new PrismaClient();
  const user = await p.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } });
  if (!user) {
    throw new Error("No active admin user found in DB");
  }
  console.log("Using active admin user:", user.email, user.name);

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

  const screenshotDir = path.join(process.cwd(), "public", "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // 1. Check login page unauthenticated
  const loginPage = await context.newPage();
  console.log("Navigating to login page...");
  await loginPage.goto("http://localhost:3340/login", { waitUntil: "networkidle" });
  await loginPage.screenshot({ path: path.join(screenshotDir, "login-1440.png"), fullPage: false });
  console.log("Saved login screenshot to public/screenshots/login-1440.png");
  await loginPage.close();

  // 2. Set session cookies for authenticated views
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      url: "http://localhost:3340",
    },
  ]);

  const page = await context.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  console.log("Navigating to http://localhost:3340/dashboard...");
  await page.goto("http://localhost:3340/dashboard", { waitUntil: "networkidle", timeout: 45000 });
  console.log("Current URL on dashboard:", page.url());

  const dashboardPath = path.join(screenshotDir, "dashboard-1440.png");
  await page.screenshot({ path: dashboardPath, fullPage: false });
  console.log("Saved dashboard screenshot to", dashboardPath);

  // Inspect computed styles
  const styles = await page.evaluate(`
    (() => {
      function getInfo(selector) {
        const el = document.querySelector(selector);
        if (!el) return { found: false, selector: selector };
        const cs = window.getComputedStyle(el);
        return {
          found: true,
          selector: selector,
          tagName: el.tagName,
          className: el.className,
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          borderColor: cs.borderColor,
          width: cs.width,
          borderRadius: cs.borderRadius,
        };
      }

      return {
        sidebar: getInfo("aside"),
        main: getInfo("main"),
        header: getInfo("header"),
        primaryButton: getInfo("header button, main button, aside a"),
        card: getInfo("main [class*='rounded'], main [class*='border']"),
      };
    })()
  `);

  console.log("COMPUTED_STYLES_RESULT:\n" + JSON.stringify(styles, null, 2));

  // 3. Leads
  console.log("Navigating to /leads...");
  await page.goto("http://localhost:3340/leads", { waitUntil: "networkidle", timeout: 45000 });
  const leadsPath = path.join(screenshotDir, "leads-1440.png");
  await page.screenshot({ path: leadsPath, fullPage: false });
  console.log("Saved leads screenshot to", leadsPath);

  // 4. Properties
  console.log("Navigating to /properties...");
  await page.goto("http://localhost:3340/properties", { waitUntil: "networkidle", timeout: 45000 });
  const propertiesPath = path.join(screenshotDir, "properties-1440.png");
  await page.screenshot({ path: propertiesPath, fullPage: false });
  console.log("Saved properties screenshot to", propertiesPath);

  // 5. Property detail
  const propLink = await page.$("a[href^='/properties/']");
  if (propLink) {
    const href = await propLink.getAttribute("href");
    if (href && href !== "/properties/new" && href !== "/properties/import") {
      console.log("Navigating to property detail:", href);
      await page.goto("http://localhost:3340" + href, { waitUntil: "networkidle", timeout: 45000 });
      const propDetailPath = path.join(screenshotDir, "property-detail-1440.png");
      await page.screenshot({ path: propDetailPath, fullPage: false });
      console.log("Saved property detail screenshot to", propDetailPath);
    }
  }

  // 6. Mobile viewport
  console.log("Switching to mobile viewport 390x844...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3340/dashboard", { waitUntil: "networkidle", timeout: 45000 });
  const mobileDashboardPath = path.join(screenshotDir, "dashboard-390.png");
  await page.screenshot({ path: mobileDashboardPath, fullPage: false });
  console.log("Saved mobile dashboard screenshot to", mobileDashboardPath);

  await browser.close();
  await p.$disconnect();
}

main().catch(console.error);

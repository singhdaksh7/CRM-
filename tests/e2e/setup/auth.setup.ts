import { test as setup, expect } from "@playwright/test";
import path from "path";
import { QA_PASSWORD, QA_USERS } from "./seed-qa";

const STATE_DIR = path.join(__dirname, "..", ".auth");

async function loginAs(page: import("@playwright/test").Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByPlaceholder("you@delhibrokercrm.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign In to CRM" }).click();
  // The app navigates client-side (router.push after signIn) - no full page
  // reload, so the default waitUntil:"load" never fires and this would hang
  // for the full timeout even after the URL already matches. "commit"
  // resolves as soon as the SPA navigation is committed. 30s (not the
  // default 15s) because `next dev` compiles each route on first hit, and
  // this budget covers signIn + the target route's cold compile under
  // serial (workers:1) load.
  await page.waitForURL(expectedPath, { timeout: 30_000, waitUntil: "commit" });
  await expect(page).toHaveURL(expectedPath);
}

setup("authenticate as admin", async ({ page }) => {
  await loginAs(page, QA_USERS.admin.email, /\/dashboard/);
  await page.context().storageState({ path: path.join(STATE_DIR, "admin.json") });
});

setup("authenticate as data manager", async ({ page }) => {
  await loginAs(page, QA_USERS.dataManager.email, /\/dashboard/);
  await page.context().storageState({ path: path.join(STATE_DIR, "data-manager.json") });
});

setup("authenticate as field executive", async ({ page }) => {
  await loginAs(page, QA_USERS.fieldExecutive.email, /\/executive-dashboard/);
  await page.context().storageState({ path: path.join(STATE_DIR, "field-executive.json") });
});

setup("authenticate as unassigned field executive", async ({ page }) => {
  await loginAs(page, QA_USERS.unassignedFieldExecutive.email, /\/executive-dashboard/);
  await page.context().storageState({ path: path.join(STATE_DIR, "unassigned-field-executive.json") });
});

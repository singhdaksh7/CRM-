import type { FullConfig } from "@playwright/test";
import { assertSafeBaseUrl, assertSafeDatabaseUrl } from "../helpers/safety-guard";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3100";
  assertSafeBaseUrl(baseURL);
  assertSafeDatabaseUrl(process.env.DATABASE_URL);
  console.log(`[safety-guard] baseURL OK: ${baseURL}`);
  console.log(
    `[safety-guard] DATABASE_URL host OK: ${new URL(process.env.DATABASE_URL!).hostname}`
  );
}

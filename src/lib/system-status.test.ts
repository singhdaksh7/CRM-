import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkEnvironment, checkWhatsApp } from "./system-status";

const ENV_KEYS = ["DATABASE_URL", "AUTH_SECRET", "NEXTAUTH_URL", "NEXT_PUBLIC_APP_URL", "WHATSAPP_PROVIDER", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("checkEnvironment", () => {
  it("is ok when all required vars are set", () => {
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.AUTH_SECRET = "secret";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(checkEnvironment().status).toBe("ok");
  });

  it("errors and names the missing variable", () => {
    process.env.DATABASE_URL = "file:./dev.db";
    delete process.env.AUTH_SECRET;
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const result = checkEnvironment();
    expect(result.status).toBe("error");
    expect(result.detail).toMatch(/AUTH_SECRET/);
  });
});

describe("checkWhatsApp", () => {
  it("is ok for MOCK with no credentials", () => {
    process.env.WHATSAPP_PROVIDER = "MOCK";
    expect(checkWhatsApp().status).toBe("ok");
  });

  it("is ok for CLICK_TO_CHAT with no credentials", () => {
    process.env.WHATSAPP_PROVIDER = "CLICK_TO_CHAT";
    expect(checkWhatsApp().status).toBe("ok");
  });

  it("errors for META_CLOUD without credentials", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    expect(checkWhatsApp().status).toBe("error");
  });

  it("is ok for META_CLOUD with full credentials", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "id";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify";
    expect(checkWhatsApp().status).toBe("ok");
  });

  it("errors for an unknown provider name", () => {
    process.env.WHATSAPP_PROVIDER = "TWILIO";
    expect(checkWhatsApp().status).toBe("error");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallGuideView } from "./install-guide-view";
import type { InstallState } from "@/lib/pwa/install-store";
import type { InstallEnv } from "@/lib/pwa/install";

function render(env: InstallEnv | null, over: Partial<InstallState> = {}) {
  const state: InstallState = { env, canPrompt: false, installed: false, lastOutcome: null, ...over };
  return renderToStaticMarkup(createElement(InstallGuideView, { state, onInstall: () => {} }));
}

const env = (over: Partial<InstallEnv>): InstallEnv => ({ platform: "windows", browser: "chrome", standalone: false, ...over });

describe("Install KP CRM page", () => {
  it("renders the title, intro and all four device cards", () => {
    const html = render(null);
    expect(html).toContain("Install KP CRM");
    expect(html).toContain("opens like an app and uses the same secure CRM account");
    for (const device of ["ios", "android", "windows", "mac"]) expect(html).toContain(`data-device="${device}"`);
  });

  it("shows the iOS Share-menu instructions and no install button on iPhone Safari", () => {
    const html = render(env({ platform: "ios", browser: "safari" }));
    expect(html).toContain("Open KP CRM in Safari.");
    expect(html).toContain("Tap Share.");
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("Open as Web App");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("other than Safari");
  });

  it("recommends Safari when on iPhone with another browser", () => {
    expect(render(env({ platform: "ios", browser: "chrome" }))).toContain("other than Safari");
  });

  it("never offers a JS install button on iOS even if a prompt were somehow reported", () => {
    expect(render(env({ platform: "ios", browser: "chrome" }), { canPrompt: true })).not.toContain("<button");
  });

  it("shows the native Install button on Android Chrome when the prompt is available", () => {
    const html = render(env({ platform: "android" }), { canPrompt: true });
    expect(html).toContain("<button");
    expect(html).toContain("Install KP CRM</button>");
  });

  it("falls back to Chrome menu steps on Android without a prompt", () => {
    const html = render(env({ platform: "android" }));
    expect(html).not.toContain("<button");
    expect(html).toContain("Install app");
    expect(html).toContain("Confirm the install.");
  });

  it("shows the native button on desktop Chromium and fallback steps otherwise", () => {
    expect(render(env({ platform: "windows" }), { canPrompt: true })).toContain("Install KP CRM</button>");
    const fallback = render(env({ platform: "windows" }));
    expect(fallback).toContain("Cast, save and share");
    expect(fallback).toContain("Install page as app");
    expect(render(env({ platform: "mac", browser: "chrome" }))).toContain("Cast, save and share");
  });

  it("gives Mac Safari a File > Add to Dock fallback and tells Firefox to switch", () => {
    expect(render(env({ platform: "mac", browser: "safari" }))).toContain("Add to Dock");
    expect(render(env({ platform: "windows", browser: "firefox" }))).toContain("Open KP CRM in Chrome or Edge");
  });

  it("shows the installed state and hides install actions when standalone", () => {
    const html = render(env({ standalone: true }), { canPrompt: true });
    expect(html).toContain("KP CRM is installed on this device");
    expect(html).not.toContain("<button");
  });

  it("shows the installed state after the appinstalled event", () => {
    expect(render(env({}), { installed: true })).toContain("KP CRM is installed on this device");
  });

  it("acknowledges a dismissed native prompt", () => {
    expect(render(env({}), { lastOutcome: "dismissed" })).toContain("Installation was cancelled");
  });

  it("lists the visitor's own device first and marks it", () => {
    const html = render(env({ platform: "android" }));
    expect(html.indexOf('data-device="android"')).toBeLessThan(html.indexOf('data-device="ios"'));
    expect(html).toContain("This device");
  });
});

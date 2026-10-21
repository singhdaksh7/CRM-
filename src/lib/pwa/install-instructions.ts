import type { InstallPlatform } from "./install";

export interface DeviceGuide {
  platform: Exclude<InstallPlatform, "other">;
  title: string;
  subtitle: string;
  /** Steps shown when no native install prompt is available (always shown on iOS). */
  steps: string[];
  /** Extra guidance shown beneath the steps. */
  note?: string;
}

export const DEVICE_GUIDES: DeviceGuide[] = [
  {
    platform: "ios",
    title: "iPhone / iPad",
    subtitle: "Safari",
    steps: [
      "Open KP CRM in Safari.",
      "Tap Share.",
      "Tap Add to Home Screen.",
      "Enable Open as Web App if shown.",
      "Tap Add.",
    ],
    note: "Apple does not allow a website to trigger installation with a button, so this has to be done from Safari's Share menu.",
  },
  {
    platform: "android",
    title: "Android",
    subtitle: "Chrome",
    steps: [
      "Open the Chrome menu.",
      "Choose Install app (or Install and create shortcut, or the equivalent option in your browser).",
      "Confirm the install.",
    ],
  },
  {
    platform: "windows",
    title: "Windows",
    subtitle: "Chrome or Edge",
    steps: [
      "Open KP CRM in Chrome.",
      "Open the Chrome menu.",
      "Go to Cast, save and share.",
      "Choose Install page as app…",
    ],
    note: "You can also click the install icon in the address bar when it appears. In Edge, use Settings and more → Apps → Install this site as an app.",
  },
  {
    platform: "mac",
    title: "Mac",
    subtitle: "Chrome, Edge or Safari",
    steps: [
      "Open KP CRM in Chrome.",
      "Open the Chrome menu.",
      "Go to Cast, save and share.",
      "Choose Install page as app…",
    ],
    note: "In Safari 17 or later (macOS Sonoma or newer), use File → Add to Dock. Older Safari versions cannot install web apps - use Chrome instead.",
  },
];

export const INSTALL_INTRO =
  "Install KP CRM on your phone or computer for faster access. It opens like an app and uses the same secure CRM account.";

export const IOS_NON_SAFARI_NOTE =
  "You appear to be using a browser other than Safari. For the most reliable installation on iPhone and iPad, open KP CRM in Safari.";

export const FIREFOX_NOTE =
  "Firefox on desktop cannot install web apps. Open KP CRM in Chrome or Edge to install it.";

export const INSTALLED_MESSAGE = "KP CRM is installed on this device";

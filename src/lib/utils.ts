import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a number as Indian currency: 20000 -> "₹20,000", 8500000 -> "₹85 Lakh", 12500000 -> "₹1.25 Cr" */
export function formatINR(amount: number | null | undefined, opts?: { compact?: boolean; suffix?: string }): string {
  if (amount === null || amount === undefined) return "-";
  const suffix = opts?.suffix ? `/${opts.suffix}` : "";
  if (opts?.compact) {
    if (amount >= 10000000) return `₹${trimDecimal(amount / 10000000)} Cr${suffix}`;
    if (amount >= 100000) return `₹${trimDecimal(amount / 100000)} Lakh${suffix}`;
  }
  return `₹${formatIndianNumber(amount)}${suffix}`;
}

function trimDecimal(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Indian digit grouping: 1234567 -> "12,34,567" */
export function formatIndianNumber(num: number): string {
  const [intPart, decPart] = Math.abs(num).toFixed(0).toString().split(".");
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}` : lastThree;
  return (num < 0 ? "-" : "") + formatted + (decPart ? `.${decPart}` : "");
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function enumToLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function generateCode(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(5, "0")}`;
}

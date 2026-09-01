import type { Page } from "@playwright/test";

/**
 * Detects whole-page horizontal overflow. Returns null when clean, or a
 * description of the offending scroll width otherwise. Intentional
 * horizontal-scroll containers (e.g. a table wrapped in overflow-x:auto)
 * are not flagged - only overflow of the document itself.
 */
export async function detectHorizontalOverflow(page: Page): Promise<string | null> {
  const result = await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientWidth = docEl.clientWidth;
    if (scrollWidth <= clientWidth + 1) return null;

    // Best-effort: find an element wider than the viewport to help debugging.
    let offender = "unknown";
    const all = document.querySelectorAll<HTMLElement>("body *");
    for (const el of Array.from(all)) {
      if (el.scrollWidth > clientWidth + 1) {
        offender = el.tagName + (el.className ? `.${String(el.className).toString().split(" ")[0]}` : "");
        break;
      }
    }
    return `scrollWidth=${scrollWidth} clientWidth=${clientWidth} offender=${offender}`;
  });
  return result;
}

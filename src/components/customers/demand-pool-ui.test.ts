import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchExplanation } from "@/components/customers/match-explanation";
import { MatchTierBadge, RequirementLifecycleBadge } from "@/components/customers/badges";
import { RequirementForm } from "@/components/customers/requirement-form";

describe("match tier and explanation UI", () => {
  it("renders tier badge text equivalents", () => {
    const html = renderToStaticMarkup(React.createElement(MatchTierBadge, { tier: "STRONG" }));
    expect(html).toContain("STRONG");
    expect(html).toContain("Match tier STRONG");
  });

  it("renders stale lifecycle badge", () => {
    const html = renderToStaticMarkup(React.createElement(RequirementLifecycleBadge, { status: "STALE" }));
    expect(html).toContain("STALE");
  });

  it("renders explainable match reasons with text equivalents", () => {
    const html = renderToStaticMarkup(
      React.createElement(MatchExplanation, {
        tier: "STRONG",
        score: 88,
        reasons: [
          { label: "Locality", matched: true, detail: "Rajouri Garden exact" },
          { label: "Budget", matched: false, detail: "Property is 11% above budget" },
        ],
      })
    );
    expect(html).toContain("Strong Match — 88%");
    expect(html).toContain("Rajouri Garden exact");
    expect(html).toContain("Property is 11% above budget");
    expect(html).toContain("Matched:");
    expect(html).toContain("Warning:");
  });
});

describe("requirement form conditional fields", () => {
  it("shows BHK for residential defaults", () => {
    const html = renderToStaticMarkup(React.createElement(RequirementForm, { onSubmit: () => undefined }));
    expect(html).toContain("BHK");
    expect(html).not.toContain("Commercial subtype");
  });
});

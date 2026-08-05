import { describe, it, expect } from "vitest";
import { toCsv } from "./report-builder";

describe("toCsv", () => {
  it("joins header and rows with commas and newlines", () => {
    const csv = toCsv({ header: ["A", "B"], rows: [[1, "x"], [2, "y"]] });
    expect(csv).toBe("A,B\n1,x\n2,y");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    const csv = toCsv({ header: ["Name"], rows: [['Say "hi", please'], ["line1\nline2"]] });
    expect(csv).toContain('"Say ""hi"", please"');
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null/undefined cells as empty strings", () => {
    const csv = toCsv({ header: ["A"], rows: [[null as unknown as string]] });
    expect(csv.split("\n")[1]).toBe("");
  });
});

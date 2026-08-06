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

  it("prevents CSV/Excel formula injection by prefixing a leading apostrophe on cells starting with =, +, -, or @", () => {
    const csv = toCsv({
      header: ["Name"],
      rows: [["=cmd|calc!A1"], ["+1+1"], ["-2+3"], ["@SUM(A1:A2)"]],
    });
    const lines = csv.split("\n").slice(1);
    expect(lines[0]).toBe("'=cmd|calc!A1");
    expect(lines[1]).toBe("'+1+1");
    expect(lines[2]).toBe("'-2+3");
    expect(lines[3]).toBe("'@SUM(A1:A2)");
  });

  it("leaves ordinary cell values (including ones merely containing = elsewhere) untouched", () => {
    const csv = toCsv({ header: ["Name"], rows: [["a=b"], ["Normal Name"]] });
    const lines = csv.split("\n").slice(1);
    expect(lines[0]).toBe("a=b");
    expect(lines[1]).toBe("Normal Name");
  });
});

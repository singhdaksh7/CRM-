import { describe, expect, it } from "vitest";
import { phase5BhkLabel } from "./phase5-analytics";

describe("phase5BhkLabel", () => {
  it("preserves the residential 1 RK storage convention in analytics", () => {
    expect(phase5BhkLabel(0)).toBe("1 RK");
    expect(phase5BhkLabel(1)).toBe("1 BHK");
    expect(phase5BhkLabel(2)).toBe("2 BHK");
  });

  it("uses Any only when the configuration is absent", () => {
    expect(phase5BhkLabel(null)).toBe("Any");
    expect(phase5BhkLabel(undefined)).toBe("Any");
  });
});

import { describe, it, expect } from "vitest";
import { directionsUrl, directionsUrlForAddress, viewOnMapUrl, viewOnMapUrlForAddress, bestDirectionsUrl } from "./external-directions";

describe("directionsUrl", () => {
  it("builds the universal Google Maps directions URL", () => {
    const url = directionsUrl({ latitude: 28.6139, longitude: 77.209 });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=28.6139%2C77.209");
  });

  it("includes an origin when provided", () => {
    const url = directionsUrl({ latitude: 28.6139, longitude: 77.209 }, { latitude: 28.7, longitude: 77.1 });
    expect(url).toContain("origin=28.7%2C77.1");
  });

  it("never requires an API key (no key param present)", () => {
    const url = directionsUrl({ latitude: 28.6139, longitude: 77.209 });
    expect(url).not.toContain("key=");
  });
});

describe("directionsUrlForAddress", () => {
  it("URL-encodes the address as the destination", () => {
    const url = directionsUrlForAddress("123 Main St, Janakpuri, Delhi");
    expect(url).toContain("destination=123");
    expect(decodeURIComponent(new URL(url).searchParams.get("destination")!)).toBe("123 Main St, Janakpuri, Delhi");
  });
});

describe("viewOnMapUrl / viewOnMapUrlForAddress", () => {
  it("builds a simple map view URL from coordinates", () => {
    expect(viewOnMapUrl({ latitude: 28.6, longitude: 77.2 })).toBe("https://www.google.com/maps?q=28.6,77.2");
  });

  it("builds a simple map view URL from an address", () => {
    expect(viewOnMapUrlForAddress("Janakpuri, Delhi")).toBe(`https://www.google.com/maps?q=${encodeURIComponent("Janakpuri, Delhi")}`);
  });
});

describe("bestDirectionsUrl", () => {
  it("prefers coordinates when available", () => {
    const url = bestDirectionsUrl({ latitude: 28.6, longitude: 77.2, address: "Some Address" });
    expect(url).toContain("destination=28.6%2C77.2");
  });

  it("falls back to the address when coordinates are missing", () => {
    const url = bestDirectionsUrl({ latitude: null, longitude: null, address: "Janakpuri, Delhi" });
    expect(decodeURIComponent(new URL(url).searchParams.get("destination")!)).toBe("Janakpuri, Delhi");
  });

  it("falls back to the address when coordinates are undefined", () => {
    const url = bestDirectionsUrl({ address: "Rohini, Delhi" });
    expect(url).toContain("Rohini");
  });
});

import { describe, it, expect } from "vitest";
import { isValidCoordinates, isPlausibleDelhiNcrCoordinates, haversineDistanceMeters } from "./geo";

describe("isValidCoordinates", () => {
  it("accepts a real coordinate pair", () => {
    expect(isValidCoordinates({ latitude: 28.6139, longitude: 77.209 })).toBe(true);
  });

  it("rejects non-numeric values", () => {
    expect(isValidCoordinates({ latitude: "28.6", longitude: 77.2 })).toBe(false);
  });

  it("rejects NaN/Infinity", () => {
    expect(isValidCoordinates({ latitude: NaN, longitude: 77.2 })).toBe(false);
    expect(isValidCoordinates({ latitude: Infinity, longitude: 77.2 })).toBe(false);
  });

  it("rejects out-of-range latitude/longitude", () => {
    expect(isValidCoordinates({ latitude: 95, longitude: 77.2 })).toBe(false);
    expect(isValidCoordinates({ latitude: 28.6, longitude: 190 })).toBe(false);
  });

  it("rejects the 0,0 null-island placeholder", () => {
    expect(isValidCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it("rejects a missing/null input", () => {
    expect(isValidCoordinates(null)).toBe(false);
    expect(isValidCoordinates(undefined)).toBe(false);
  });
});

describe("isPlausibleDelhiNcrCoordinates", () => {
  it("accepts a coordinate inside the Delhi-NCR box", () => {
    expect(isPlausibleDelhiNcrCoordinates({ latitude: 28.6139, longitude: 77.209 })).toBe(true);
  });

  it("rejects a coordinate far outside Delhi-NCR (e.g. Mumbai)", () => {
    expect(isPlausibleDelhiNcrCoordinates({ latitude: 19.076, longitude: 72.8777 })).toBe(false);
  });
});

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters({ latitude: 28.6, longitude: 77.2 }, { latitude: 28.6, longitude: 77.2 })).toBe(0);
  });

  it("computes a plausible distance between two known Delhi points", () => {
    // India Gate to Connaught Place is roughly 2.5km
    const distance = haversineDistanceMeters({ latitude: 28.6129, longitude: 77.2295 }, { latitude: 28.6315, longitude: 77.2167 });
    expect(distance).toBeGreaterThan(1500);
    expect(distance).toBeLessThan(4000);
  });

  it("is symmetric", () => {
    const a = { latitude: 28.6, longitude: 77.2 };
    const b = { latitude: 28.7, longitude: 77.3 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 5);
  });
});

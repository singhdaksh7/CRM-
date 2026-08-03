import type { Coordinates } from "./geo";

/**
 * Universal Google Maps URLs - work in any browser/app without the Maps
 * JavaScript API, any API key, or MAPS_PROVIDER being configured at all.
 * These are the fallback that must always work per the task's disabled-mode
 * requirements: a Field Executive can always open directions to a visit,
 * even with Maps fully disabled.
 */

/** `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` - opens turn-by-turn navigation in the Google Maps app/website. */
export function directionsUrl(destination: Coordinates, origin?: Coordinates): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
  if (origin) url.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  return url.toString();
}

/** Same as `directionsUrl` but keyed off a free-text address when no coordinate exists yet - still works with zero API key. */
export function directionsUrlForAddress(address: string): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", address);
  return url.toString();
}

/** A simple "view on map" link (not turn-by-turn) for a known coordinate. */
export function viewOnMapUrl(coordinates: Coordinates): string {
  return `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`;
}

/** A simple "view on map" link keyed off a free-text address. */
export function viewOnMapUrlForAddress(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}`;
}

/** Best available destination for "Open in Google Maps"/"Start navigation": prefers real coordinates, falls back to the free-text address so the button is never disabled just because a property hasn't been geocoded yet. */
export function bestDirectionsUrl(params: { latitude?: number | null; longitude?: number | null; address: string }): string {
  if (typeof params.latitude === "number" && typeof params.longitude === "number") {
    return directionsUrl({ latitude: params.latitude, longitude: params.longitude });
  }
  return directionsUrlForAddress(params.address);
}

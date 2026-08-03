import { MapsConfigError } from "./maps-errors";
import type {
  MapsProvider,
  GeocodeInput,
  GeocodeResult,
  Coordinates,
  AddressResult,
  DirectionsInput,
  DirectionsResult,
  DistanceMatrixInput,
  DistanceMatrixResult,
  PlaceSearchInput,
  PlaceResult,
  MapsDiagnosticsResult,
} from "./maps-types";

const NOT_CONFIGURED_MESSAGE = "Maps integration is not configured - set MAPS_PROVIDER to GOOGLE (see .env.example / GOOGLE_MAPS_SETUP.md)";

/**
 * Default provider when MAPS_PROVIDER is unset or DISABLED. Every method
 * fails clearly and safely rather than the app crashing - callers must
 * catch MapsConfigError and render a "not configured" state, exactly like
 * the DisabledStorageProvider/Mock-less paths already do for storage.
 * Property/Visit CRUD themselves never depend on this - only the
 * maps-specific panels do.
 */
export class DisabledMapsProvider implements MapsProvider {
  readonly name = "DISABLED" as const;

  async geocode(_input: GeocodeInput): Promise<GeocodeResult[]> {
    throw new MapsConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async reverseGeocode(_input: Coordinates): Promise<AddressResult> {
    throw new MapsConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async getDirections(_input: DirectionsInput): Promise<DirectionsResult> {
    throw new MapsConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async getDistanceMatrix(_input: DistanceMatrixInput): Promise<DistanceMatrixResult> {
    throw new MapsConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async searchPlaces(_input: PlaceSearchInput): Promise<PlaceResult[]> {
    throw new MapsConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async getDiagnostics(): Promise<MapsDiagnosticsResult> {
    return { ok: false, details: { provider: "DISABLED", note: "No maps provider configured" } };
  }
}

/** Provider is missing config or was misused (e.g. GOOGLE selected with no API key). Never carries the key itself. */
export class MapsConfigError extends Error {}

/** The provider's underlying API call failed (network, timeout, quota, invalid response). Safe to show `.message` to an Admin diagnostics screen - never includes raw provider payloads or the API key. */
export class MapsProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
  }
}

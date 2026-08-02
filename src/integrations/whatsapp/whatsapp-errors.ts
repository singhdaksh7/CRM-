export class WhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppConfigError";
  }
}

export class WhatsAppProviderError extends Error {
  provider: string;
  cause?: unknown;
  constructor(provider: string, message: string, cause?: unknown) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.provider = provider;
    this.cause = cause;
  }
}

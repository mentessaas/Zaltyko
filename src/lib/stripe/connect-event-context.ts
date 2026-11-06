import { getOptionalEnvVar } from "@/lib/env";

export class ConnectEventRejectedError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ConnectEventRejectedError";
  }
}

/** Deployment-level guard, not evidence of the mode of historical DB rows. */
export function getConfiguredConnectLiveMode(): boolean {
  const key = getOptionalEnvVar("STRIPE_SECRET_KEY");
  const match = key?.match(/^(?:sk|rk)_(test|live)_.+$/);
  if (!match) {
    // Configuration failures must remain retryable; never acknowledge/drop an
    // otherwise valid historical event because the server is misconfigured.
    throw new Error("CONNECT_ENVIRONMENT_NOT_CONFIGURED");
  }
  return match[1] === "live";
}

export function assertConnectEventMode(mode: unknown, expected: boolean): void {
  if (typeof mode !== "boolean" || mode !== expected) {
    throw new ConnectEventRejectedError("CONNECT_ENVIRONMENT_MISMATCH");
  }
}

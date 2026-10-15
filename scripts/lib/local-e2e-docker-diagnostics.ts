// Registry-controlled text is classified and discarded, never retained in errors.
const patterns = [
  ["rate-limit", /too many requests|toomanyrequests|rate.?limit|\b429\b/i],
  [
    "authentication-or-permission",
    /unauthorized|authentication required|access denied|denied:|\b(?:401|403)\b/i,
  ],
  [
    "manifest-or-platform",
    /manifest unknown|no matching manifest|manifest.*not found|unsupported platform/i,
  ],
  ["disk-space", /no space left on device|disk quota exceeded/i],
  ["timeout", /timed? ?out|deadline exceeded/i],
  [
    "network-or-registry",
    /connection reset|connection refused|no such host|unexpected EOF|TLS handshake|\b(?:500|502|503|504)\b/i,
  ],
] as const;
export type DockerDiagnosticFlag = (typeof patterns)[number][0];
export function dockerDiagnosticFlags(stderr: string): DockerDiagnosticFlag[] {
  return patterns
    .filter(([, pattern]) => pattern.test(stderr))
    .map(([flag]) => flag);
}
export function formatDockerDiagnosticFlags(
  flags: readonly DockerDiagnosticFlag[]
): string {
  return `Diagnostic indicators: ${flags.length ? flags.join(", ") : "unclassified"}. Raw stderr omitted.`;
}
export type DigestFallbackStage =
  "pin" | "ecr-pull" | "hub-pull" | "hub-inspect" | "ecr-retag" | "ecr-inspect";
const reasons = {
  pin: "No verified digest pin for image; refusing pull.",
  clock: "Image preload budget exhausted or clock invalid.",
  command: "Image Docker command failed; raw output omitted.",
  primary:
    "ECR pull failed without an exclusive rate-limit indicator; fallback refused.",
  hub: "Docker Hub digest fallback failed; no retry permitted.",
  inspection: "Image inspection failed; refusing retag.",
  identity: "Image identity verification failed; refusing ECR retag.",
  tag: "Verified image ECR retag failed.",
} as const;
export class DigestFallbackError extends Error {
  readonly flags: readonly DockerDiagnosticFlag[];
  constructor(
    readonly stage: DigestFallbackStage,
    readonly status: number | null,
    readonly reason: keyof typeof reasons,
    flags: readonly DockerDiagnosticFlag[] = []
  ) {
    super(
      `${reasons[reason]} Stage: ${stage}; docker exit status ${status ?? "unknown"}. ${formatDockerDiagnosticFlags(flags)}`
    );
    this.name = "DigestFallbackError";
    this.flags = Object.freeze([...flags]);
  }
}

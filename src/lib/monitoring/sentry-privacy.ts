/** Shared by browser, Node and Edge. No Node APIs or SDK side effects. */
const ERROR_TYPES = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError",
  "URIError", "EvalError", "AggregateError", "UnhandledRejection",
]);
const LEVELS = new Set(["fatal", "error", "warning", "log", "info", "debug"]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown> : {};
}

function frames(value: unknown) {
  const input = record(value).frames;
  if (!Array.isArray(input)) return undefined;
  return { frames: input.slice(-100).map((item) => {
    const frame = record(item);
    const safe: Record<string, unknown> = {};
    // Only generated Next chunk locations; never local paths, source lines or vars.
    const filename = typeof frame.filename === "string"
      ? frame.filename.split(/[?#]/, 1)[0] : "";
    const chunk = filename.match(/(?:^|\/)_(?:next)\/static\/chunks\/[a-f0-9]+(?:-[a-f0-9]+)*\.js$/);
    if (chunk) safe.filename = chunk[0].replace(/^\//, "");
    for (const key of ["lineno", "colno"] as const) {
      if (Number.isSafeInteger(frame[key]) && Number(frame[key]) >= 0) safe[key] = frame[key];
    }
    if (typeof frame.in_app === "boolean") safe.in_app = frame.in_app;
    return safe;
  }) };
}

/** An allowlist, rather than a blacklist of known credential names. */
export function sanitizeSentryEvent<T extends object>(event: T): T {
  const input = record(event);
  const safe: Record<string, unknown> = {};
  if (typeof input.event_id === "string" && /^[a-f0-9]{32}$/i.test(input.event_id)) safe.event_id = input.event_id;
  for (const key of ["timestamp", "start_timestamp"] as const) {
    if (typeof input[key] === "number" && Number.isFinite(input[key])) safe[key] = input[key];
  }
  if (typeof input.level === "string" && LEVELS.has(input.level)) safe.level = input.level;
  if (input.platform === "javascript" || input.platform === "node") safe.platform = input.platform;
  if (typeof input.release === "string" && /^[a-f0-9]{7,40}$/i.test(input.release)) safe.release = input.release;
  if (typeof input.environment === "string" && ["production", "preview", "test"].includes(input.environment)) safe.environment = input.environment;
  if (input.type === "transaction") {
    safe.type = "transaction";
    safe.transaction = "[Filtered transaction]";
    // Spans carry arbitrary SQL, URLs and attributes. Keep aggregate timing only.
    safe.spans = [];
  }
  const trace = record(record(input.contexts).trace);
  const safeTrace: Record<string, unknown> = {};
  for (const key of ["trace_id", "span_id", "parent_span_id"] as const) {
    const length = key === "trace_id" ? 32 : 16;
    if (typeof trace[key] === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(trace[key])) safeTrace[key] = trace[key];
  }
  if (Object.keys(safeTrace).length) safe.contexts = { trace: safeTrace };
  const values = record(input.exception).values;
  if (Array.isArray(values)) {
    safe.exception = { values: values.slice(0, 10).map((item) => {
      const error = record(item);
      return {
        type: typeof error.type === "string" && ERROR_TYPES.has(error.type) ? error.type : "Error",
        value: "[Filtered error details]",
        ...(frames(error.stacktrace) ? { stacktrace: frames(error.stacktrace) } : {}),
      };
    }) };
  } else if (input.type !== "transaction") {
    safe.message = "[Filtered diagnostic event]";
  }
  return safe as T;
}

function beforeSend<T extends object>(event: T, hint?: { attachments?: unknown[] }): T | null {
  if (hint) hint.attachments = [];
  if (process.env.NODE_ENV === "development") return null;
  return sanitizeSentryEvent(event);
}

export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  enableLogs: false,
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  beforeSend,
  beforeSendTransaction: beforeSend,
};

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeSentryEvent, sentryPrivacyOptions } from "@/lib/monitoring/sentry-privacy";

afterEach(() => vi.unstubAllEnvs());

describe("Sentry privacy boundary", () => {
  it("drops arbitrary PII containers, URLs, mixed-case headers and database detail without mutating input", () => {
    const event = {
      event_id: "a".repeat(32), level: "error", timestamp: 123,
      user: { email: "private@example.test", ip_address: "192.0.2.1" },
      request: { url: "https://example.test/?code=private-code", headers: { Authorization: "private-header" }, data: { name: "Private Person" } },
      message: "Private Person", extra: { sql: "select private-data" }, tags: { email: "private@example.test" },
      breadcrumbs: [{ message: "private-crumb" }], contexts: { custom: { secret: "private-context" } },
      fingerprint: ["private-fingerprint"], sdk: { metadata: "private-sdk" }, unknown: "private-unknown",
      exception: { values: [{ type: "TypeError", value: "private-error", stacktrace: { frames: [{ filename: "/Users/private-person/file.ts", function: "private-function", vars: { secret: "private-vars" }, pre_context: ["private-source"], lineno: 12, colno: 3 }] } }] },
    };
    const original = JSON.stringify(event);
    const result = sanitizeSentryEvent(event);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(result.exception.values[0]).toEqual({ type: "TypeError", value: "[Filtered error details]", stacktrace: { frames: [{ lineno: 12, colno: 3 }] } });
    expect(result.event_id).toBe(event.event_id);
    expect(JSON.stringify(event)).toBe(original);
  });

  it("removes trace attributes/spans but preserves validated correlation and timings", () => {
    const result = sanitizeSentryEvent({ type: "transaction", transaction: "/athlete/PrivateName?token=secret", start_timestamp: 10, timestamp: 12,
      contexts: { trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), parent_span_id: "not-a-safe-id", data: { sql: "secret" }, op: "secret-op" } },
      spans: [{ description: "secret SQL", data: { email: "private@example.test" } }], measurements: { secret: 1 }, transaction_info: { source: "secret" } });
    expect(result).toEqual({ type: "transaction", transaction: "[Filtered transaction]", start_timestamp: 10, timestamp: 12, spans: [], contexts: { trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16) } } });
  });

  it("retains generated chunk locations without query, source or local variables", () => {
    const result = sanitizeSentryEvent({ exception: { values: [{ type: "PersonalErrorName", stacktrace: { frames: [{ filename: "https://example.test/_next/static/chunks/1234-abcdef.js?secret=value#fragment", lineno: 4, in_app: true, vars: { secret: "value" } }] } }] } });
    expect(result.exception.values[0].type).toBe("Error");
    expect(result.exception.values[0].stacktrace.frames[0]).toEqual({ filename: "_next/static/chunks/1234-abcdef.js", lineno: 4, in_app: true });
  });

  it("clears hint attachments and handles cyclic unknown context", () => {
    vi.stubEnv("NODE_ENV", "production");
    const hint = { attachments: [{ filename: "private.txt", data: "private" }] };
    const event: { extra?: unknown } = {}; event.extra = event;
    expect(sentryPrivacyOptions.beforeSend(event, hint)).toEqual({ message: "[Filtered diagnostic event]" });
    expect(hint.attachments).toEqual([]);
  });

  it("drops development events and breadcrumbs, disables default PII collection", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sentryPrivacyOptions.beforeSend({ message: "secret" })).toBeNull();
    expect(sentryPrivacyOptions.beforeSendTransaction({ type: "transaction" })).toBeNull();
    expect(sentryPrivacyOptions.beforeBreadcrumb()).toBeNull();
    expect(sentryPrivacyOptions.sendDefaultPii).toBe(false);
    expect(sentryPrivacyOptions.maxBreadcrumbs).toBe(0);
  });

  it.each(["instrumentation-client.ts", "instrumentation.ts", "sentry.server.config.ts", "sentry.edge.config.ts"])("wires shared boundary in %s without local overriding callbacks", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("...sentryPrivacyOptions");
    expect(source).not.toMatch(/beforeSend\s*\(/);
    expect(source).not.toContain("sendDefaultPii: true");
    if (file === "instrumentation.ts") expect(source.match(/\.\.\.sentryPrivacyOptions/g)).toHaveLength(2);
  });

  it("does not load or sample browser replay", () => {
    const source = readFileSync("instrumentation-client.ts", "utf8");
    expect(source).toContain("replaysOnErrorSampleRate: 0");
    expect(source).toContain("replaysSessionSampleRate: 0");
    expect(source).not.toContain("lazyLoadIntegration(");
    expect(source).not.toContain("Sentry.addIntegration(");
  });
});

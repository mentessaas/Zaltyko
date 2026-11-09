import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  transaction: vi.fn(), execute: vi.fn(), actor: vi.fn(), suppression: vi.fn(), fetch: vi.fn(),
  reserved: new Set<string>(), updates: [] as unknown[][], validIndex: true,
}));
vi.mock("@/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: state.actor } }) }));
vi.mock("@/lib/email/marketing-consent", () => ({ hasMarketingOptOut: state.suppression }));

import { deliveryContactEmailRequestSha256, sendDeliveryContactEmail, type DeliveryContactEmailCommand } from "@/lib/email/delivery-contact-email";

const command: DeliveryContactEmailCommand = {
  name: "Adulto QA sintético", email: "qa@example.invalid", academy: null, reason: "support", plan: null,
  source: "public_contact", message: "Aviso sintético QA marcador cerrado 7f3b.", honeypot: "",
  directoryEntryId: null, marketAccess: null,
  submissionId: "10000000-0000-4000-8000-000000000001", visitorId: "10000000-0000-4000-8000-000000000002",
};
const actor = { id: "10000000-0000-4000-8000-000000000003", email: command.email, email_confirmed_at: "2026-11-06T10:00:00Z" };
const forbidden = ["BREVO_API_KEY", "TWILIO_AUTH_TOKEN", "MAILGUN_API_KEY", "SENTRY_DSN", "SENTRY_AUTH_TOKEN", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_SAAS_LIVE_SECRET_KEY", "CRON_SECRET"];
function approved() {
  const env = {
    ZALTYKO_DELIVERY_PREVIEW: "true", ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED: "true",
    VERCEL_ENV: "preview", VERCEL: "1", VERCEL_GIT_COMMIT_REF: "codex/mvp-main-bridge-20261025",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), NODE_ENV: "production", ZALTYKO_TEAM_ACCESS_ENABLED: "false",
    DELIVERY_CONTACT_EMAIL_API_KEY: "synthetic-exclusive-key", DELIVERY_CONTACT_EMAIL_QA_EMAIL: command.email,
    DELIVERY_CONTACT_EMAIL_QA_AUTH_USER_ID: actor.id, DELIVERY_CONTACT_EMAIL_RUN_ID: "synthetic-run-7f3b0001",
    DELIVERY_CONTACT_EMAIL_REQUEST_SHA256: deliveryContactEmailRequestSha256(command),
    DELIVERY_CONTACT_EMAIL_APPROVED_COMMIT_SHA: "a".repeat(40),
    DELIVERY_CONTACT_EMAIL_EXPIRES_AT: "2026-11-06T12:30:00Z",
  };
  for (const name of [...forbidden, "CI", "GITHUB_ACTIONS"]) vi.stubEnv(name, undefined);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  approved(); state.reserved.clear(); state.updates.length = 0; state.validIndex = true;
  state.actor.mockReset().mockResolvedValue({ data: { user: actor }, error: null });
  state.suppression.mockReset().mockResolvedValue(false);
  state.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ messageId: "synthetic-provider-id" }), { status: 201 }));
  vi.stubGlobal("fetch", state.fetch);
  state.execute.mockReset().mockImplementation(async (statement: SQL) => {
    const query = new PgDialect().sqlToQuery(statement);
    if (query.sql.includes("select exists")) return { rows: [{ valid: state.validIndex }] };
    if (query.sql.includes("insert into email_logs")) {
      const key = String(query.params[3]);
      if (state.reserved.has(key)) return { rows: [] };
      state.reserved.add(key);
      return { rows: [{ id: "10000000-0000-4000-8000-000000000004" }] };
    }
    if (query.sql.includes("update email_logs")) {
      state.updates.push(query.params);
      return { rows: [{ id: "10000000-0000-4000-8000-000000000004" }] };
    }
    return { rows: [] };
  });
  state.transaction.mockReset().mockImplementation(async (action) => action({ execute: state.execute }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("exclusive delivery contact email", () => {
  it("defaults OFF before Auth, reservation or fetch", async () => {
    vi.stubEnv("ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED", undefined);
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "disabled" });
    expect(state.actor).not.toHaveBeenCalled(); expect(state.transaction).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each(["API_KEY", "QA_EMAIL", "QA_AUTH_USER_ID", "RUN_ID", "REQUEST_SHA256", "APPROVED_COMMIT_SHA", "EXPIRES_AT"])("requires complete enabled namespace %s", async (key) => {
    vi.stubEnv(`DELIVERY_CONTACT_EMAIL_${key}`, undefined);
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "configuration" });
    expect(state.actor).not.toHaveBeenCalled(); expect(state.transaction).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["ZALTYKO_DELIVERY_PREVIEW", "false"], ["VERCEL_ENV", "production"], ["VERCEL", undefined],
    ["VERCEL_GIT_COMMIT_REF", "main"], ["VERCEL_GIT_COMMIT_SHA", "b".repeat(40)],
    ["NODE_ENV", "test"], ["NODE_ENV", "development"], ["GITHUB_ACTIONS", "true"], ["CI", "1"],
    ["DELIVERY_CONTACT_EMAIL_API_KEY", ""], ["DELIVERY_CONTACT_EMAIL_QA_EMAIL", "QA@example.invalid"],
    ["DELIVERY_CONTACT_EMAIL_QA_AUTH_USER_ID", "not-a-uuid"], ["DELIVERY_CONTACT_EMAIL_RUN_ID", "short"],
    ["DELIVERY_CONTACT_EMAIL_REQUEST_SHA256", "bad"], ["DELIVERY_CONTACT_EMAIL_APPROVED_COMMIT_SHA", "b".repeat(40)],
    ["DELIVERY_CONTACT_EMAIL_EXPIRES_AT", "2026-11-06T11:59:59Z"],
    ["DELIVERY_CONTACT_EMAIL_EXPIRES_AT", "2026-11-06T13:00:01Z"],
    ["DELIVERY_CONTACT_EMAIL_EXPIRES_AT", "2026-11-06T12:30:00+00:00"],
    ["ZALTYKO_TEAM_ACCESS_ENABLED", "true"], ...forbidden.map((key) => [key, "synthetic"]),
  ])("rejects context/config %s before Auth and fetch", async (key, value) => {
    vi.stubEnv(key!, value);
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "configuration" });
    expect(state.actor).not.toHaveBeenCalled(); expect(state.transaction).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each([
    null, { ...actor, id: "10000000-0000-4000-8000-000000000005" },
    { ...actor, email: "other@example.invalid" }, { ...actor, email_confirmed_at: null },
  ])("requires the exact confirmed Auth actor", async (user) => {
    state.actor.mockResolvedValue({ data: { user }, error: null });
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "actor" });
    expect(state.transaction).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
  });
  it("rejects an Auth failure even when the response contains a user", async () => {
    state.actor.mockResolvedValue({ data: { user: actor }, error: { message: "synthetic" } });
    expect((await sendDeliveryContactEmail(command)).outcome).toBe("skipped");
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each(["name", "email", "academy", "reason", "plan", "source", "message", "honeypot", "directoryEntryId", "marketAccess"] as const)("binds normalized semantic field %s", async (field) => {
    const changed = { ...command, [field]: field === "marketAccess" ? { countryName: "Synthetic" } : "different" };
    expect(await sendDeliveryContactEmail(changed)).toEqual({ outcome: "skipped", reason: "request" });
    expect(state.actor).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
  });
  it("uses a fixed sender, destination, transport and a verified QA Reply-To", async () => {
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "accepted" });
    expect(state.suppression).toHaveBeenCalledWith("hola@zaltyko.com");
    expect(state.reserved.size).toBe(1); expect(state.fetch).toHaveBeenCalledTimes(1);
    expect([...state.reserved]).toEqual(["email:delivery-contact-qa:synthetic-run-7f3b0001"]);
    const [endpoint, options] = state.fetch.mock.calls[0];
    expect(endpoint).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.redirect).toBe("error");
    expect(options.headers["api-key"]).toBe("synthetic-exclusive-key");
    const body = JSON.parse(options.body);
    expect(body.sender).toEqual({ email: "hola@zaltyko.com", name: "Zaltyko" });
    expect(body.to).toEqual([{ email: "hola@zaltyko.com" }]);
    expect(body.replyTo).toEqual({ email: command.email });
    expect(Object.keys(body).sort()).toEqual(["htmlContent", "replyTo", "sender", "subject", "textContent", "to"]);
    expect(state.updates[0][0]).toBe("sent");
    expect(JSON.parse(String(state.updates[0][3]))).toEqual({ deliveryContactQa: true, result: "api_accepted", messageId: "synthetic-provider-id" });
    expect(JSON.stringify(state.updates)).not.toContain("synthetic-exclusive-key");
    expect(JSON.stringify(state.updates)).not.toContain(command.email);
  });
  it("consumes one run across concurrency and different submission/visitor UUIDs", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => sendDeliveryContactEmail({
      ...command, submissionId: `10000000-0000-4000-8000-00000000001${index}`, visitorId: `10000000-0000-4000-8000-00000000002${index}`,
    })));
    expect(results.filter((result) => result.outcome === "accepted")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "skipped" && result.reason === "duplicate")).toHaveLength(7);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves suppression and fails closed if that gate cannot be read", async () => {
    state.suppression.mockResolvedValue(true);
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "suppressed" });
    state.suppression.mockRejectedValue(new Error("synthetic"));
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "unavailable" });
    expect(state.transaction).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
  });
  it("requires the valid unconditional unique index before reservation", async () => {
    state.validIndex = false;
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "unavailable" });
    expect(state.reserved.size).toBe(0); expect(state.fetch).not.toHaveBeenCalled();
  });
  it("does not fetch when reservation fails", async () => {
    state.transaction.mockRejectedValue(new Error("synthetic database unavailable"));
    expect((await sendDeliveryContactEmail(command)).outcome).toBe("skipped"); expect(state.fetch).not.toHaveBeenCalled();
  });
  it("rechecks expiry after actor/gates and before reservation", async () => {
    state.suppression.mockImplementation(async () => { vi.setSystemTime(new Date("2026-11-06T12:30:01Z")); return false; });
    expect((await sendDeliveryContactEmail(command)).outcome).toBe("skipped");
    expect(state.reserved.size).toBe(0); expect(state.fetch).not.toHaveBeenCalled();
  });
  it("consumes a reservation if the window closes before fetch", async () => {
    state.transaction.mockImplementation(async (action) => {
      const result = await action({ execute: state.execute });
      vi.setSystemTime(new Date("2026-11-06T12:30:01Z")); return result;
    });
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "expired" });
    expect(state.reserved.size).toBe(1); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each([{ simulated: true, messageId: "synthetic" }, {}, { messageId: null }, { messageId: "" }])("never marks unconfirmed/simulated acceptance sent (%o)", async (body) => {
    state.fetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 201 }));
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "uncertain" });
    expect(state.updates[0][0]).toBe("failed");
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "skipped", reason: "duplicate" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([[400, "failed"], [429, "uncertain"], [503, "uncertain"]])("does not retry HTTP %s", async (status, outcome) => {
    state.fetch.mockResolvedValue(new Response(null, { status: Number(status) }));
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome });
    expect((await sendDeliveryContactEmail(command)).outcome).toBe("skipped"); expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it("consumes a network timeout without retry", async () => {
    state.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("synthetic timeout")));
    }));
    const pending = sendDeliveryContactEmail(command);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toEqual({ outcome: "uncertain" });
    expect((await sendDeliveryContactEmail(command)).outcome).toBe("skipped"); expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not infer acceptance from malformed 2xx JSON", async () => {
    state.fetch.mockResolvedValue(new Response("malformed", { status: 201 }));
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "uncertain" });
    expect(state.updates[0][0]).toBe("failed"); expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it("never persists a credential reflected by an invalid provider identifier", async () => {
    state.fetch.mockResolvedValue(new Response(JSON.stringify({ messageId: "reflected-synthetic-exclusive-key" }), { status: 201 }));
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "uncertain" });
    expect(JSON.stringify(state.updates)).not.toContain("synthetic-exclusive-key");
  });
  it("does not turn an accepted provider result into certainty if final persistence fails", async () => {
    state.transaction.mockImplementationOnce(async (action) => action({ execute: state.execute })).mockRejectedValue(new Error("synthetic second transaction failure"));
    expect(await sendDeliveryContactEmail(command)).toEqual({ outcome: "uncertain" });
    expect(state.reserved.size).toBe(1); expect(state.fetch).toHaveBeenCalledTimes(1); expect(state.updates).toHaveLength(0);
  });
});

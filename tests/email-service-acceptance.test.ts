import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  send: vi.fn(), consent: vi.fn(), suppression: vi.fn(), preference: vi.fn(), eligibility: vi.fn(),
  select: vi.fn(), insert: vi.fn(), update: vi.fn(),
  inserted: [] as Record<string, unknown>[], updated: [] as Record<string, unknown>[],
  existing: false, reservation: true,
}));
vi.mock("@/db", () => ({ db: { select: state.select, insert: state.insert, update: state.update } }));
vi.mock("@/db/schema", () => ({ emailLogs: {
  id: "id", template: "template", status: "status", metadata: "metadata", createdAt: "created_at",
} }));
vi.mock("@/lib/brevo", () => ({ sendEmail: state.send }));
vi.mock("@/config", () => ({ config: { brevo: { supportEmail: "support@example.invalid" } } }));
vi.mock("@/lib/academy-status", () => ({ isAcademyBlockedFromSending: state.eligibility }));
vi.mock("@/lib/directory/communications", () => ({ hasPositiveMarketingConsent: state.consent }));
vi.mock("@/lib/email/marketing-consent", () => ({ hasMarketingOptOut: state.suppression }));
vi.mock("@/lib/notifications/preferences", () => ({ isEmailNotificationEnabled: state.preference }));

import { sendEmailWithLogging, type SendEmailOptions } from "@/lib/email/email-service";

const options: SendEmailOptions = {
  to: "  QA@example.invalid  ", subject: "Synthetic acceptance test", html: "<p>Synthetic message</p>",
  text: "Synthetic message", replyTo: "reply@example.invalid", template: "synthetic-acceptance",
  tenantId: "synthetic-tenant", academyId: "synthetic-academy", userId: "synthetic-user",
  profileId: "synthetic-profile", notificationType: "class_reminder", classReminderTiming: "24h",
  metadata: { marker: "synthetic-only" }, dedupeKey: "synthetic-one-attempt",
};

beforeEach(() => {
  state.inserted.length = 0; state.updated.length = 0; state.existing = false; state.reservation = true;
  state.send.mockReset().mockResolvedValue({ simulated: false, messageId: "synthetic-provider-id" });
  state.consent.mockReset().mockResolvedValue(true); state.suppression.mockReset().mockResolvedValue(false);
  state.preference.mockReset().mockResolvedValue(true); state.eligibility.mockReset().mockResolvedValue({ blocked: false });
  state.select.mockReset().mockReturnValue({ from: () => ({ where: () => ({ limit: async () => state.existing ? [{ id: "synthetic-existing" }] : [] }) }) });
  state.insert.mockReset().mockReturnValue({ values: (value: Record<string, unknown>) => {
    state.inserted.push(value);
    return { onConflictDoNothing: () => ({ returning: async () => state.reservation ? [{ id: "synthetic-log" }] : [] }) };
  } });
  state.update.mockReset().mockReturnValue({ set: (value: Record<string, unknown>) => {
    state.updated.push(value); return { where: async () => undefined };
  } });
});
afterEach(() => vi.unstubAllEnvs());

describe("shared email API acceptance", () => {
  it("returns true and marks sent only after explicit non-simulated acceptance", async () => {
    expect(await sendEmailWithLogging(options)).toBe(true);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send).toHaveBeenCalledWith({
      to: options.to, subject: options.subject, html: options.html, text: options.text, replyTo: options.replyTo,
    });
    expect(state.inserted).toEqual([{
      tenantId: options.tenantId, academyId: options.academyId, userId: options.profileId,
      toEmail: "qa@example.invalid", subject: options.subject, template: options.template, status: "pending",
      idempotencyKey: "email:synthetic-one-attempt", metadata: { marker: "synthetic-only", dedupeKey: options.dedupeKey },
    }]);
    expect(state.updated).toEqual([{ status: "sent", sentAt: expect.any(Date) }]);
    expect(state.preference).toHaveBeenCalledWith(options.profileId, options.notificationType, options.classReminderTiming);
    expect(state.suppression).toHaveBeenCalledWith("qa@example.invalid");
    expect(state.eligibility).toHaveBeenCalledWith(options.academyId);
    expect(state.consent).not.toHaveBeenCalled();
  });
  it.each([
    { simulated: true, messageId: null }, { simulated: true, messageId: "synthetic-id" },
  ])("does not count simulation as acceptance (%o)", async (result) => {
    state.send.mockResolvedValue(result);
    expect(await sendEmailWithLogging(options)).toBe(false);
    expect(state.updated).toEqual([{ status: "failed", errorMessage: "EMAIL_DELIVERY_SIMULATED" }]);
    expect(state.updated[0]).not.toHaveProperty("sentAt"); expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.inserted[0].idempotencyKey).toBe("email:synthetic-one-attempt");
  });
  it.each([
    null, undefined, {}, "malformed", 1, false, [],
    { simulated: false }, { simulated: false, messageId: null }, { simulated: false, messageId: undefined },
    { simulated: false, messageId: "" }, { simulated: false, messageId: " \n\t " },
    { simulated: false, messageId: 1 }, { simulated: false, messageId: { private: "synthetic payload" } },
    { messageId: "synthetic-id" }, { simulated: undefined, messageId: "synthetic-id" },
    { simulated: "false", messageId: "synthetic-id" }, { simulated: null, messageId: "synthetic-id" },
  ])("fails closed for an unconfirmed/malformed result (%o)", async (result) => {
    state.send.mockResolvedValue(result);
    expect(await sendEmailWithLogging(options)).toBe(false);
    expect(state.updated).toEqual([{ status: "failed", errorMessage: "EMAIL_ACCEPTANCE_UNCONFIRMED" }]);
    expect(state.updated[0]).not.toHaveProperty("sentAt");
    expect(JSON.stringify(state.updated)).not.toContain("synthetic payload");
    expect(state.send).toHaveBeenCalledTimes(1); expect(state.inserted).toHaveLength(1);
  });
  it.each([new Error("BREVO_API_ERROR:503"), new Error("synthetic private error"), "synthetic failure"])("preserves real provider errors and sanitized failure storage", async (error) => {
    state.send.mockRejectedValue(error);
    await expect(sendEmailWithLogging(options)).rejects.toBe(error);
    expect(state.updated).toEqual([{ status: "failed", errorMessage: error instanceof Error && error.message.startsWith("BREVO_API_ERROR:") ? error.message : "EMAIL_DELIVERY_FAILED" }]);
    expect(state.updated[0]).not.toHaveProperty("sentAt"); expect(state.send).toHaveBeenCalledTimes(1);
  });
  it.each(["marketing", "preference", "suppression", "eligibility"])("preserves the %s gate before reservation or transport", async (gate) => {
    if (gate === "marketing") state.consent.mockResolvedValue(false);
    if (gate === "preference") state.preference.mockResolvedValue(false);
    if (gate === "suppression") state.suppression.mockResolvedValue(true);
    if (gate === "eligibility") state.eligibility.mockResolvedValue({ blocked: true, reason: "synthetic-block" });
    expect(await sendEmailWithLogging({ ...options, ...(gate === "marketing" ? { purpose: "marketing" as const } : {}) })).toBe(false);
    expect(state.insert).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled();
  });
  it("preserves both the read dedupe and the unique-reservation conflict", async () => {
    state.existing = true;
    expect(await sendEmailWithLogging(options)).toBe(false);
    expect(state.insert).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled();
    state.existing = false; state.reservation = false;
    expect(await sendEmailWithLogging(options)).toBe(false);
    expect(state.insert).toHaveBeenCalledTimes(1); expect(state.send).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });
  it("never reads a QA credential as a global sender fallback", async () => {
    vi.stubEnv("DELIVERY_CONTACT_EMAIL_API_KEY", "synthetic-unused-exclusive-key");
    state.send.mockResolvedValue({ simulated: true, messageId: null });
    expect(await sendEmailWithLogging(options)).toBe(false);
    expect(JSON.stringify(state.send.mock.calls)).not.toContain("synthetic-unused-exclusive-key");
    expect(JSON.stringify(state.updated)).not.toContain("synthetic-unused-exclusive-key");
  });
});

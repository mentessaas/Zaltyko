import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `legallyRequired` solo salta la baja de marketing (`hasMarketingOptOut`) en
 * correos transaccionales con obligación legal (confirmación de la
 * contratación, LSSI art. 28). Preferencias, academia y dedupe siguen igual.
 */
const state = vi.hoisted(() => ({
  send: vi.fn(), consent: vi.fn(), suppression: vi.fn(), preference: vi.fn(), eligibility: vi.fn(),
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), existing: false,
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

const base: SendEmailOptions = {
  purpose: "transactional",
  to: "baja-marketing@example.invalid",
  subject: "Synthetic legal confirmation",
  html: "<p>Synthetic</p>",
  text: "Synthetic",
  template: "saas-contract-confirmation",
  dedupeKey: "saas-contract-confirmation:test:sub_synthetic",
};

beforeEach(() => {
  state.existing = false;
  state.send.mockReset().mockResolvedValue({ simulated: false, messageId: "synthetic-provider-id" });
  state.consent.mockReset().mockResolvedValue(true);
  // El destinatario se dio de baja de comunicaciones comerciales.
  state.suppression.mockReset().mockResolvedValue(true);
  state.preference.mockReset().mockResolvedValue(true);
  state.eligibility.mockReset().mockResolvedValue({ blocked: false });
  state.select.mockReset().mockReturnValue({ from: () => ({ where: () => ({
    limit: async () => (state.existing ? [{ id: "synthetic-existing" }] : []),
  }) }) });
  state.insert.mockReset().mockReturnValue({ values: () => ({
    onConflictDoNothing: () => ({ returning: async () => [{ id: "synthetic-log" }] }),
  }) });
  state.update.mockReset().mockReturnValue({ set: () => ({ where: async () => undefined }) });
});

describe("correo legalmente obligatorio frente a la baja de marketing", () => {
  it("la confirmación de la contratación se envía aunque el destinatario esté dado de baja", async () => {
    expect(await sendEmailWithLogging({ ...base, legallyRequired: true })).toBe(true);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.suppression).not.toHaveBeenCalled();
  });

  it("cualquier otro correo sin la opción sigue omitido por la baja", async () => {
    expect(await sendEmailWithLogging(base)).toBe(false);
    expect(await sendEmailWithLogging({ ...base, template: "billing-invoice-notification" })).toBe(false);
    expect(await sendEmailWithLogging({ ...base, purpose: undefined })).toBe(false);
    expect(state.suppression).toHaveBeenCalledWith("baja-marketing@example.invalid");
    expect(state.send).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("no tiene efecto en un envío de marketing", async () => {
    expect(
      await sendEmailWithLogging({ ...base, purpose: "marketing", legallyRequired: true })
    ).toBe(false);
    expect(state.suppression).toHaveBeenCalledTimes(1);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("no salta las preferencias de notificación", async () => {
    state.preference.mockResolvedValue(false);
    expect(await sendEmailWithLogging({
      ...base, legallyRequired: true, profileId: "synthetic-profile", notificationType: "invoice_paid",
    })).toBe(false);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("no salta la elegibilidad de la academia", async () => {
    state.eligibility.mockResolvedValue({ blocked: true, reason: "synthetic" });
    expect(await sendEmailWithLogging({
      ...base, legallyRequired: true, academyId: "synthetic-academy",
    })).toBe(false);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("no salta la dedupe", async () => {
    state.existing = true;
    expect(await sendEmailWithLogging({ ...base, legallyRequired: true })).toBe(false);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("solo la confirmación de la contratación usa la opción", () => {
    const src = join(process.cwd(), "src");
    const files = (function collect(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return collect(path);
        return /\.(ts|tsx)$/.test(name) ? [path] : [];
      });
    })(src);
    const users = files
      .filter((file) => /legallyRequired\s*:\s*true/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split("\\").join("/"));
    expect(users).toEqual(["src/modules/saas-billing/application/contract-confirmation-email.ts"]);
  });
});

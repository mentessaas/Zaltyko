import { afterEach, describe, expect, it, vi } from "vitest";

const validEmail = {
  to: "familia@example.com",
  subject: "Recordatorio",
  html: "<p>Cuota pendiente</p>",
  replyTo: "hola@zaltyko.com",
};

afterEach(() => {
  vi.resetModules();
  vi.unmock("@/lib/env");
  delete process.env.BREVO_API_KEY;
});

describe("sendEmail Brevo configuration", () => {
  it("falla explícitamente fuera de desarrollo si falta la API key", async () => {
    delete process.env.BREVO_API_KEY;
    vi.doMock("@/lib/env", () => ({
      isDevelopment: () => false,
      isTest: () => false,
      getFeatureReadiness: () => ({ ready: false, missing: ["BREVO_API_KEY"] }),
    }));

    const { sendEmail } = await import("@/lib/brevo");

    await expect(sendEmail(validEmail)).rejects.toThrow(
      "EMAIL_NOT_CONFIGURED:BREVO_API_KEY"
    );
  });

  it("solo simula el envío sin credenciales en desarrollo", async () => {
    delete process.env.BREVO_API_KEY;
    vi.doMock("@/lib/env", () => ({
      isDevelopment: () => true,
      isTest: () => false,
      getFeatureReadiness: () => ({ ready: false, missing: ["BREVO_API_KEY"] }),
    }));

    const { sendEmail } = await import("@/lib/brevo");

    await expect(sendEmail(validEmail)).resolves.toEqual({ messageId: null, simulated: true });
  });
});

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
    vi.doMock("@/lib/env", () => ({ isDevelopment: () => false }));

    const { sendEmail } = await import("@/lib/brevo");

    await expect(sendEmail(validEmail)).rejects.toThrow(
      "BREVO_API_KEY no está configurada; el email no fue enviado"
    );
  });

  it("solo simula el envío sin credenciales en desarrollo", async () => {
    delete process.env.BREVO_API_KEY;
    vi.doMock("@/lib/env", () => ({ isDevelopment: () => true }));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendEmail } = await import("@/lib/brevo");

    await expect(sendEmail(validEmail)).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      "[brevo] Envío simulado (sin credenciales).",
      expect.objectContaining({ to: validEmail.to })
    );
    info.mockRestore();
  });
});

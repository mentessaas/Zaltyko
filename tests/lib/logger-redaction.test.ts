import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);
vi.mock("@/lib/env", () => ({ isProduction: () => true }));
vi.unmock("@/lib/logger");

import { logger, redactSensitive, redactSensitiveText } from "@/lib/logger";

describe("redactSensitive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacta Authorization y Bearer dentro de texto libre", () => {
    const value = "Authorization: Bearer bearer-secret; Bearer another-secret";

    expect(redactSensitiveText(value)).toBe(
      "Authorization: Bearer [REDACTED]; Bearer [REDACTED]"
    );
    expect(redactSensitive({ message: value })).toEqual({
      message: "Authorization: Bearer [REDACTED]; Bearer [REDACTED]",
    });
  });

  it("redacta clientSecret y client_secret recursivamente en objetos y arrays", () => {
    const value = {
      details: {
        clientSecret: "pi_secret_should_not_leak",
        nested: [{ client_secret: "pi_secret_nested_should_not_leak" }],
      },
      safe: "visible",
    };

    expect(redactSensitive(value)).toEqual({
      details: {
        clientSecret: "[REDACTED]",
        nested: [{ client_secret: "[REDACTED]" }],
      },
      safe: "visible",
    });
  });

  it("aplica la redacción a consola y a la excepción enviada a Sentry", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = new Error("charge collection failed");
    Object.assign(error, {
      clientSecret: "pi_error_secret_should_not_leak",
      context: { client_secret: "pi_error_nested_should_not_leak" },
    });

    logger.error("collectCharge fallo inesperado", error, {
      details: {
        clientSecret: "pi_context_secret_should_not_leak",
        nested: [{ client_secret: "pi_context_nested_should_not_leak" }],
      },
    });

    const consoleOutput = consoleError.mock.calls.flat().join(" ");
    expect(consoleOutput).not.toContain("should_not_leak");
    expect(consoleOutput).toContain("[REDACTED]");

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    const [capturedError, captureOptions] =
      sentryMocks.captureException.mock.calls[0];
    expect(capturedError.clientSecret).toBe("[REDACTED]");
    expect(capturedError.context.client_secret).toBe("[REDACTED]");
    expect(JSON.stringify(captureOptions)).not.toContain("should_not_leak");

    consoleError.mockRestore();
  });

  it("oculta SQL y valores de parámetros de Drizzle en consola y Sentry", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = new Error(
      'Failed query: insert into "leads" ("name", "email") values ($1, $2)\n' +
        "params: Persona Ejemplo,persona@example.test"
    );
    Object.assign(error, {
      query: 'insert into "leads" ("name", "email") values ($1, $2)',
      params: ["Persona Ejemplo", "persona@example.test"],
    });

    logger.error("Error processing contact form", error);

    const consoleOutput = consoleError.mock.calls.flat().join(" ");
    expect(consoleOutput).toContain("[REDACTED DATABASE DETAILS]");
    expect(consoleOutput).not.toContain("insert into");
    expect(consoleOutput).not.toContain("Persona Ejemplo");
    expect(consoleOutput).not.toContain("persona@example.test");

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    const [capturedError] = sentryMocks.captureException.mock.calls[0];
    expect(capturedError.message).not.toContain("insert into");
    expect(capturedError.message).not.toContain("Persona Ejemplo");
    expect(capturedError.message).not.toContain("persona@example.test");
    expect(capturedError.stack).not.toContain("Persona Ejemplo");
    expect(capturedError.stack).not.toContain("persona@example.test");
    expect(capturedError.query).toBe("[REDACTED]");
    expect(capturedError.params).toBe("[REDACTED]");

    consoleError.mockRestore();
  });

  it("redacta correos en texto libre de errores", () => {
    expect(redactSensitiveText("Fallo para persona@example.test")).toBe(
      "Fallo para [REDACTED_EMAIL]"
    );
  });
});

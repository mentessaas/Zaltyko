import { describe, expect, it } from "vitest";

import {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  TEMPLATE_VARIABLES,
  buildVariables,
  extractVariables,
  findCoerciveTerms,
  formatMoney,
  maskEmail,
  renderReminder,
  validateTemplateDraft,
  type ReminderContext,
} from "@/modules/payment-reminders/domain/reminder-template";

const context = (overrides: Partial<ReminderContext> = {}): ReminderContext => ({
  locale: "es-ES",
  timeZone: "Europe/Madrid",
  currency: "EUR",
  academyName: "Gimnasia Sol",
  payerFirstName: "María",
  charges: [{ servicePeriodStart: "2026-11-01", outstandingCents: 4500, dueAt: new Date("2026-11-05T00:00:00Z") }],
  ...overrides,
});

describe("plantilla del recordatorio de impago", () => {
  it("el texto por defecto solo usa variables conocidas y pasa su propia validación", () => {
    for (const text of [DEFAULT_SUBJECT, DEFAULT_BODY]) {
      for (const name of extractVariables(text)) expect(TEMPLATE_VARIABLES as readonly string[]).toContain(name);
    }
    expect(validateTemplateDraft({ subject: DEFAULT_SUBJECT, body: DEFAULT_BODY })).toEqual([]);
    expect(findCoerciveTerms(DEFAULT_BODY)).toEqual([]);
  });

  it("rellena importe, concepto, vencimiento, academia y datos de pago", () => {
    const rendered = renderReminder({ paymentInstructions: "Bizum al 600 000 000" }, context());
    expect(rendered.subject).toBe("Recordatorio de cuota pendiente · Gimnasia Sol");
    expect(rendered.text).toContain("Hola María:");
    expect(rendered.text).toContain("Cuota de noviembre de 2026");
    expect(rendered.text).toMatch(/45,00\s€/);
    expect(rendered.text).toContain("5 de noviembre de 2026");
    expect(rendered.text).toContain("Datos para el pago:\nBizum al 600 000 000");
    expect(rendered.html).toContain("Bizum al 600 000 000");
  });

  it("sin datos de pago no deja huecos ni la etiqueta", () => {
    const rendered = renderReminder({}, context());
    expect(rendered.text).not.toContain("Datos para el pago");
    expect(rendered.text).not.toContain("{{");
    expect(rendered.text).not.toMatch(/\n{3,}/);
  });

  it("usa la plantilla editada por la academia, sin interpretar variables dentro de los valores", () => {
    const rendered = renderReminder(
      { subject: "Cuota de {{concepto}}", body: "Buenas {{nombre}}, quedan {{importe}} de {{concepto}}. {{DATOS_DE_PAGO}}" },
      context({ payerFirstName: "{{academia}}", charges: [{ servicePeriodStart: "2026-10-01", outstandingCents: 1000, dueAt: new Date("2026-10-05T00:00:00Z") }] })
    );
    expect(rendered.subject).toBe("Cuota de Cuota de octubre de 2026");
    // El nombre es un dato: no se vuelve a interpretar como variable.
    expect(rendered.text).toContain("Buenas {{academia}}, quedan");
  });

  it("agrupa varias cuotas del mismo tutor en un solo importe total y una lista de conceptos", () => {
    const variables = buildVariables(
      context({
        charges: [
          { servicePeriodStart: "2026-11-01", outstandingCents: 4500, dueAt: new Date("2026-11-05T00:00:00Z") },
          { servicePeriodStart: "2026-10-01", outstandingCents: 4500, dueAt: new Date("2026-10-05T00:00:00Z") },
        ],
      }),
      null
    );
    expect(variables.importe).toMatch(/90,00\s€/);
    expect(variables.concepto).toBe("Cuota de octubre de 2026 y Cuota de noviembre de 2026");
    expect(variables.vencimiento).toBe("5 de octubre de 2026 y 5 de noviembre de 2026");
  });

  it("el asunto nunca contiene saltos de línea aunque el nombre los traiga", () => {
    const rendered = renderReminder({ subject: "Aviso {{nombre}}" }, context({ payerFirstName: "Ana\r\nBcc: otro@example.com" }));
    expect(rendered.subject).not.toMatch(/[\r\n]/);
  });

  it("escapa el HTML de los textos de la academia y del tutor", () => {
    const rendered = renderReminder(
      { body: "Hola {{nombre}} <script>alert(1)</script>\n{{datos_de_pago}}", paymentInstructions: "<b>IBAN</b> & más" },
      context({ payerFirstName: "<img src=x>" })
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;b&gt;IBAN&lt;/b&gt; &amp; más");
    expect(rendered.html).toContain("<br>");
  });

  it("incluye un pie fijo que explica por qué se recibe el correo", () => {
    const rendered = renderReminder({ body: "Hola" }, context());
    expect(rendered.text).toContain("figuras como persona pagadora");
    expect(rendered.html).toContain("figuras como persona pagadora");
  });

  it("usa el formato de México cuando se pide", () => {
    expect(formatMoney(150000, "MXN", "es-MX")).toContain("1,500.00");
  });

  it("enmascara el correo para la vista previa", () => {
    expect(maskEmail("maria.lopez@example.com")).toBe("m***@example.com");
    expect(maskEmail("sin-arroba")).toBe("***");
  });
});

describe("validación de la plantilla", () => {
  it("rechaza variables desconocidas, también en el asunto", () => {
    const issues = validateTemplateDraft({ subject: "Hola {{gimnasta}}", body: "{{nombre}} {{telefono}}" });
    expect(issues.map((issue) => issue.field).sort()).toEqual(["body", "subject"]);
    expect(issues.find((issue) => issue.field === "body")?.message).toContain("{{telefono}}");
  });

  it("rechaza el lenguaje de recobro agresivo", () => {
    for (const body of [
      "Sois unos morosos",
      "Procederemos al embargo",
      "Emprenderemos acciones legales",
      "Es su última advertencia",
      "Le aplicaremos un recargo por demora",
      "Pasaremos el caso a nuestro abogado",
      "Os incluiremos en ASNEF",
    ]) {
      expect(validateTemplateDraft({ body }), body).not.toEqual([]);
    }
    expect(validateTemplateDraft({ body: "Gracias por tu paciencia. Si necesitas hablarlo, responde a este correo." })).toEqual([]);
  });

  it("limita longitudes y exige asunto de una sola línea", () => {
    expect(validateTemplateDraft({ subject: "a".repeat(151) })).toHaveLength(1);
    expect(validateTemplateDraft({ body: "a".repeat(4001) })).toHaveLength(1);
    expect(validateTemplateDraft({ paymentInstructions: "a".repeat(1001) })).toHaveLength(1);
    expect(validateTemplateDraft({ subject: "una\ndos" }).some((issue) => issue.field === "subject")).toBe(true);
  });

  it("rechaza caracteres de control y trata el texto vacío como «usar el predeterminado»", () => {
    expect(validateTemplateDraft({ body: "hola\u0000" }).length).toBeGreaterThan(0);
    expect(validateTemplateDraft({ subject: "   ", body: "", paymentInstructions: null })).toEqual([]);
  });

  it("los datos de pago son texto libre y no se interpretan como variables", () => {
    expect(validateTemplateDraft({ paymentInstructions: "IBAN ES00 {{lo-que-sea}}" })).toEqual([]);
  });
});

import { escapeHtml } from "@/lib/email/escape-html";

/**
 * Plantilla del recordatorio de impago. Pura: sin base de datos ni correo.
 *
 * La academia edita asunto, cuerpo y datos de pago (texto libre suyo: IBAN,
 * Bizum, efectivo...). Solo se admiten las variables de TEMPLATE_VARIABLES, para
 * que una plantilla no pueda pedir datos que el recordatorio no debe llevar
 * (nada de nombres de menores, correos ni teléfonos). El tono es de aviso
 * amable: se rechazan expresiones de recobro agresivo al guardar.
 */

export const TEMPLATE_VARIABLES = [
  "nombre",
  "importe",
  "concepto",
  "vencimiento",
  "academia",
  "datos_de_pago",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const SUBJECT_MAX_LENGTH = 150;
export const BODY_MAX_LENGTH = 4000;
export const PAYMENT_INSTRUCTIONS_MAX_LENGTH = 1000;

export const DEFAULT_SUBJECT = "Recordatorio de cuota pendiente · {{academia}}";

export const DEFAULT_BODY = [
  "Hola {{nombre}}:",
  "",
  "Te escribimos desde {{academia}} para recordarte que tienes pendiente: {{concepto}}, por un importe de {{importe}} (vencimiento: {{vencimiento}}).",
  "",
  "{{datos_de_pago}}",
  "",
  "Si ya lo has pagado, ignora este mensaje: puede que todavía no lo hayamos anotado. Y si hay algún problema o prefieres hablarlo con nosotros, responde a este correo y lo vemos con calma.",
  "",
  "Gracias,",
  "{{academia}}",
].join("\n");

/**
 * Expresiones de recobro agresivo o intimidatorio. Es una barrera mínima y
 * explícita, no un filtro de lenguaje: la academia sigue siendo la autora.
 */
const COERCIVE_PATTERNS: ReadonlyArray<{ term: string; pattern: RegExp }> = [
  { term: "moroso", pattern: /\bmoros[oa]s?\b/i },
  { term: "embargo", pattern: /\bembarg/i },
  { term: "acciones legales", pattern: /\bacciones?\s+legales\b/i },
  { term: "reclamación judicial", pattern: /\b(reclamaci[oó]n|demanda|v[ií]a)\s+judicial\b/i },
  { term: "tribunales", pattern: /\btribunales?\b/i },
  { term: "abogado", pattern: /\babogad[oa]s?\b/i },
  { term: "denuncia", pattern: /\bdenunci(ar|a|aremos)\b/i },
  { term: "ASNEF", pattern: /\basnef\b/i },
  { term: "última advertencia", pattern: /[uú]ltim[oa]\s+(aviso|advertencia)\b/i },
  { term: "recargo", pattern: /\b(recargos?|intereses\s+de\s+demora)\b/i },
  { term: "expulsión", pattern: /\bexpulsi[oó]n\b/i },
];

export function findCoerciveTerms(text: string): string[] {
  return COERCIVE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term);
}

/** Variables `{{x}}` de un texto, tal como se escriben (en minúsculas). */
export function extractVariables(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)].map((match) => match[1].toLowerCase());
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
// Caracteres de control salvo salto de línea y tabulador.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export interface TemplateDraft {
  /** null o vacío = texto por defecto. */
  subject?: string | null;
  body?: string | null;
  paymentInstructions?: string | null;
}

export interface TemplateIssue {
  field: "subject" | "body" | "paymentInstructions";
  message: string;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized === "" ? null : normalized;
}

export function normalizeTemplateDraft(draft: TemplateDraft): {
  subject: string | null;
  body: string | null;
  paymentInstructions: string | null;
} {
  return {
    subject: normalizeText(draft.subject),
    body: normalizeText(draft.body),
    paymentInstructions: normalizeText(draft.paymentInstructions),
  };
}

export function validateTemplateDraft(draft: TemplateDraft): TemplateIssue[] {
  const { subject, body, paymentInstructions } = normalizeTemplateDraft(draft);
  const issues: TemplateIssue[] = [];

  if (subject !== null) {
    if (subject.length > SUBJECT_MAX_LENGTH) {
      issues.push({ field: "subject", message: `El asunto admite hasta ${SUBJECT_MAX_LENGTH} caracteres.` });
    }
    // Un salto de línea en el asunto abriría una cabecera nueva del correo.
    if (/\n/.test(subject)) {
      issues.push({ field: "subject", message: "El asunto debe ir en una sola línea." });
    }
  }
  if (body !== null && body.length > BODY_MAX_LENGTH) {
    issues.push({ field: "body", message: `El mensaje admite hasta ${BODY_MAX_LENGTH} caracteres.` });
  }
  if (paymentInstructions !== null && paymentInstructions.length > PAYMENT_INSTRUCTIONS_MAX_LENGTH) {
    issues.push({
      field: "paymentInstructions",
      message: `Los datos de pago admiten hasta ${PAYMENT_INSTRUCTIONS_MAX_LENGTH} caracteres.`,
    });
  }

  const fields: Array<[TemplateIssue["field"], string | null]> = [
    ["subject", subject],
    ["body", body],
    ["paymentInstructions", paymentInstructions],
  ];
  for (const [field, value] of fields) {
    if (value === null) continue;
    if (CONTROL_CHARACTERS.test(value)) {
      issues.push({ field, message: "El texto contiene caracteres no permitidos." });
    }
    if (field !== "paymentInstructions") {
      const unknown = [...new Set(extractVariables(value))].filter(
        (name) => !(TEMPLATE_VARIABLES as readonly string[]).includes(name)
      );
      if (unknown.length > 0) {
        issues.push({
          field,
          message: `Variable no reconocida: ${unknown.map((name) => `{{${name}}}`).join(", ")}. Disponibles: ${TEMPLATE_VARIABLES.map((name) => `{{${name}}}`).join(", ")}.`,
        });
      }
    }
    const coercive = findCoerciveTerms(value);
    if (coercive.length > 0) {
      issues.push({
        field,
        message: `Usa un tono de recordatorio amable: quita «${coercive.join("», «")}». Las familias deben poder contestar sin sentirse amenazadas.`,
      });
    }
  }
  return issues;
}

export interface ReminderChargeLine {
  /** Primer día del periodo de servicio (YYYY-MM-DD). */
  servicePeriodStart: string;
  outstandingCents: number;
  dueAt: Date;
}

export interface ReminderContext {
  locale: string;
  timeZone: string;
  currency: string;
  academyName: string;
  /** Nombre de pila del tutor pagador. */
  payerFirstName: string | null;
  charges: ReminderChargeLine[];
}

export function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function formatDueDate(date: Date, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
  }
}

function describePeriod(servicePeriodStart: string, locale: string): string {
  const [year, month] = servicePeriodStart.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return "Cuota";
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
  return `Cuota de ${label}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Valores de las variables para un envío (uno o varios cargos de un mismo tutor y moneda). */
export function buildVariables(context: ReminderContext, paymentInstructions: string | null): Record<TemplateVariable, string> {
  const ordered = [...context.charges].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const total = ordered.reduce((sum, line) => sum + line.outstandingCents, 0);
  const concepts = [...new Set(ordered.map((line) => describePeriod(line.servicePeriodStart, context.locale)))];
  const earliest = ordered[0]?.dueAt ?? new Date(0);
  const dueDates = [...new Set(ordered.map((line) => formatDueDate(line.dueAt, context.locale, context.timeZone)))];
  return {
    nombre: context.payerFirstName?.trim() || "familia",
    importe: formatMoney(total, context.currency, context.locale),
    concepto: joinList(concepts),
    vencimiento: ordered.length > 1 ? joinList(dueDates) : formatDueDate(earliest, context.locale, context.timeZone),
    academia: context.academyName,
    datos_de_pago: paymentInstructions ? `Datos para el pago:\n${paymentInstructions}` : "",
  };
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function substitute(template: string, variables: Record<TemplateVariable, string>, transform: (value: string) => string = (v) => v): string {
  return template.replace(VARIABLE_PATTERN, (_match, rawName: string) => {
    const name = rawName.toLowerCase() as TemplateVariable;
    return name in variables ? transform(variables[name]) : "";
  });
}

export interface RenderedReminder {
  subject: string;
  text: string;
  html: string;
}

/**
 * Pie fijo: no editable. Informa de por qué se recibe el mensaje (RGPD, art. 13)
 * y deja claro que responder llega a la academia.
 */
function footer(academyName: string): string {
  return `Recibes este correo porque figuras como persona pagadora de las cuotas de ${academyName}. Si crees que es un error, responde a este mensaje.`;
}

export function renderReminder(
  draft: TemplateDraft,
  context: ReminderContext
): RenderedReminder {
  const normalized = normalizeTemplateDraft(draft);
  const variables = buildVariables(context, normalized.paymentInstructions);
  const subjectTemplate = normalized.subject ?? DEFAULT_SUBJECT;
  const bodyTemplate = normalized.body ?? DEFAULT_BODY;

  const subject = singleLine(substitute(subjectTemplate, variables, singleLine));
  // Sin datos de pago, la línea de la variable desaparece sin dejar huecos.
  const rawBody = substitute(bodyTemplate, variables).replace(/\n{3,}/g, "\n\n").trim();
  const text = `${rawBody}\n\n--\n${footer(context.academyName)}`;

  const htmlBody = escapeHtml(rawBody).replace(/\n/g, "<br>");
  const html = [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; font-size: 16px; line-height: 1.55; max-width: 600px;">`,
    `<p style="margin: 0 0 24px 0;">${htmlBody}</p>`,
    `<p style="margin: 0; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">${escapeHtml(footer(context.academyName))}</p>`,
    `</div>`,
  ].join("");
  return { subject, text, html };
}

/** `m***@dominio.com`: confirma el destinatario sin mostrar la dirección entera. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

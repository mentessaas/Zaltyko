/**
 * Cobro automático de cuotas (Fase 3): aviso a la familia cuando falla el
 * primer cobro de una cuota. Decisión de Elvis D3 (17-11-2026): la familia
 * recibe un correo con el enlace a /familia/cuotas para revisar su tarjeta, y
 * la academia ve la incidencia en su lista de cobros.
 *
 * Reglas:
 * - solo el intento 1: los reintentos y las reanudaciones nunca avisan otra vez;
 * - un solo aviso por intento: la clave del outbox es
 *   `family-collection:{id del intento}:family_failure_notice`;
 * - el outbox solo lleva ids (intento y factura), nunca datos de la familia;
 * - el texto nunca promete un reintento que no vaya a ocurrir (política de
 *   reintentos de retry-policy.ts) y nunca enlaza el cobro de Stripe del
 *   intento cerrado: solo /familia/cuotas.
 *
 * Funciones puras: sin base de datos ni correo.
 */
import { escapeHtml } from "@/lib/email/escape-html";

import { isAuthenticationRequiredFailure } from "./payment-outcome";

/** Nombre del paso en el outbox (`family_collection.{paso}`) y en su clave. */
export const FAMILY_FAILURE_NOTICE = "family_failure_notice";
export const FAMILY_FAILURE_NOTICE_EVENT = `family_collection.${FAMILY_FAILURE_NOTICE}`;

/** Resultado del envío del aviso (enviado o por qué no): uno por intento. */
export const FAMILY_FAILURE_NOTICE_RESULT = "family_failure_notice_result";
export const FAMILY_FAILURE_NOTICE_RESULT_EVENT = `family_collection.${FAMILY_FAILURE_NOTICE_RESULT}`;

/** Solo el primer intento de una cuota avisa a la familia. */
export const FAMILY_FAILURE_NOTICE_ATTEMPT_NUMBER = 1;

/** Página del portal a la que lleva el aviso (nunca al cobro de Stripe). */
export const FAMILY_FEES_PATH = "/familia/cuotas";

/** Plantilla del correo (registro de envíos). */
export const FAMILY_FAILURE_NOTICE_TEMPLATE = "family_collection_failure";

/**
 * Código de un intento que se agotó sin saber nada de Stripe: el mismo que
 * TRANSIENT_EXHAUSTED_CODE de family-collection-steps.ts (aquí no se importa
 * la capa de aplicación). La tarjeta puede estar bien: no se le pide revisarla.
 */
export const NOT_CONFIRMED_FAILURE_CODE = "transient_exhausted";

export function familyFailureNoticeKey(attemptId: string): string {
  return `family-collection:${attemptId}:${FAMILY_FAILURE_NOTICE}`;
}

export function familyFailureNoticeResultKey(attemptId: string): string {
  return `family-collection:${attemptId}:${FAMILY_FAILURE_NOTICE_RESULT}`;
}

/**
 * ¿Este fallo avisa a la familia? Solo un fallo de verdad en Stripe (rechazo
 * del banco o autenticación pedida) del primer intento de la cuota. Nunca:
 * - un reintento (intentos 2 y siguientes) ni una reanudación (el intento ya
 *   se cerró una vez: applyOutcome solo escribe sobre intentos abiertos);
 * - un intento `canceled` por la puerta o por la academia (domiciliación sin
 *   activar, recordatorio ya enviado, importe mínimo, método o pagador que
 *   cambió, ventana de cobro pasada…): no es un cobro fallido;
 * - un intento agotado sin saber nada de Stripe (`transient_exhausted`): el
 *   banco no rechazó nada y la tarjeta puede estar bien.
 * Quien llama solo la usa con un intento que pasa a `failed`.
 */
export function notifiesFamilyOnFailure(input: { attemptNumber: number; failureCode: string }): boolean {
  return (
    input.attemptNumber === FAMILY_FAILURE_NOTICE_ATTEMPT_NUMBER &&
    input.failureCode !== NOT_CONFIRMED_FAILURE_CODE
  );
}

/**
 * Qué se le cuenta a la familia:
 * - `retry_scheduled`: tarjeta con rechazo recuperable y reintento programado;
 * - `authentication_required`: el banco pide que la persona confirme el pago
 *   (en esta fase no se reintenta: la cuota pasa a cobrarse a mano);
 * - `card_declined`: tarjeta rechazada sin reintento;
 * - `sepa_failed`: domiciliación devuelta (nunca hay reintentos);
 * - `not_collected`: no se pudo confirmar el cobro (sin pedir que revise nada).
 */
export type FamilyFailureNoticeKind =
  | "retry_scheduled"
  | "authentication_required"
  | "card_declined"
  | "sepa_failed"
  | "not_collected";

export function familyFailureNoticeKind(input: {
  paymentMethodKind: string | null;
  failureCode: string | null;
  declineCode: string | null;
  /** El intento guardó `next_retry_at`. */
  retryScheduled: boolean;
}): FamilyFailureNoticeKind {
  if (input.paymentMethodKind === "sepa_debit") return "sepa_failed";
  if (input.paymentMethodKind !== "card") return "not_collected";
  if (input.failureCode === NOT_CONFIRMED_FAILURE_CODE) return "not_collected";
  if (
    input.failureCode === "requires_action" ||
    isAuthenticationRequiredFailure({ code: input.failureCode, declineCode: input.declineCode })
  ) {
    return "authentication_required";
  }
  return input.retryScheduled ? "retry_scheduled" : "card_declined";
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function monthOf(localDate: string | null): { day: number; month: string; year: string } | null {
  const match = localDate ? LOCAL_DATE.exec(localDate) : null;
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  return { day, month, year: match[1]! };
}

/** «la cuota de noviembre de 2026» a partir del primer día del periodo; si no se puede, «tu cuota». */
export function feeLabel(servicePeriodStart: string | null): string {
  const parts = monthOf(servicePeriodStart);
  return parts ? `la cuota de ${parts.month} de ${parts.year}` : "tu cuota";
}

/** «18 de noviembre» a partir de una fecha local (YYYY-MM-DD), o null. */
export function retryDayLabel(localDate: string | null): string | null {
  const parts = monthOf(localDate);
  return parts ? `${parts.day} de ${parts.month}` : null;
}

export interface FamilyFailureNoticeMessage {
  subject: string;
  text: string;
  html: string;
}

const NOT_AUTOMATIC_ANYMORE = "Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.";

/** Párrafos del aviso y texto del enlace según lo que pasó. */
function noticeBody(
  kind: FamilyFailureNoticeKind,
  fee: string,
  retryDay: string | null
): { lines: string[]; linkText: string } {
  switch (kind) {
    case "retry_scheduled":
      return {
        lines: [
          `No hemos podido cobrar con tu tarjeta ${fee}. El banco no lo ha aceptado esta vez.`,
          retryDay
            ? `Volveremos a intentarlo el ${retryDay} con la tarjeta que tengas guardada. Si quieres usar otra, cámbiala antes en Zaltyko.`
            : "Volveremos a intentarlo en unos días con la tarjeta que tengas guardada. Si quieres usar otra, cámbiala antes en Zaltyko.",
        ],
        linkText: "Revisar mi tarjeta",
      };
    case "authentication_required":
      return {
        lines: [
          `No hemos podido cobrar con tu tarjeta ${fee}: tu banco pide que confirmes tú el pago, y eso no se puede hacer de forma automática.`,
          NOT_AUTOMATIC_ANYMORE,
          "En Zaltyko puedes ver tus cuotas y revisar tu tarjeta.",
        ],
        linkText: "Ver mis cuotas",
      };
    case "card_declined":
      return {
        lines: [
          `No hemos podido cobrar con tu tarjeta ${fee}. El banco no lo ha aceptado.`,
          NOT_AUTOMATIC_ANYMORE,
          "Para que las próximas cuotas se cobren bien, revisa tu tarjeta en Zaltyko.",
        ],
        linkText: "Revisar mi tarjeta",
      };
    case "sepa_failed":
      return {
        lines: [
          `No hemos podido cobrar por domiciliación ${fee}. El banco no lo ha aceptado.`,
          NOT_AUTOMATIC_ANYMORE,
          "Para que las próximas cuotas se cobren bien, revisa tu forma de pago en Zaltyko.",
        ],
        linkText: "Revisar mi forma de pago",
      };
    default:
      return {
        lines: [`No hemos podido cobrar ${fee}.`, NOT_AUTOMATIC_ANYMORE, "En Zaltyko puedes ver tus cuotas."],
        linkText: "Ver mis cuotas",
      };
  }
}

/**
 * Correo del aviso. Sin nombres, importes ni datos de la tarjeta: la cuota
 * (mes), la fecha del reintento si lo hay y el enlace a /familia/cuotas.
 */
export function renderFamilyFailureNotice(input: {
  kind: FamilyFailureNoticeKind;
  academyName: string;
  /** Primer día del periodo de la cuota (YYYY-MM-DD) o null. */
  servicePeriodStart: string | null;
  /** Día local del reintento (YYYY-MM-DD); solo cuenta en `retry_scheduled`. */
  retryDateLocal: string | null;
  /** URL de /familia/cuotas. */
  feesUrl: string;
}): FamilyFailureNoticeMessage {
  const fee = feeLabel(input.servicePeriodStart);
  const retryDay = retryDayLabel(input.retryDateLocal);
  const academy = input.academyName.trim() || "Tu academia";

  const { lines, linkText } = noticeBody(input.kind, fee, retryDay);
  const closing = `Si tienes cualquier duda, habla con ${academy}.`;
  const subject = `${academy}: no hemos podido cobrar ${fee}`.slice(0, 160);
  const text = ["Hola:", ...lines, `${linkText}: ${input.feesUrl}`, closing].join("\n\n");
  const paragraph = (value: string) => `<p style="margin:0 0 12px">${escapeHtml(value)}</p>`;
  const html = [
    paragraph("Hola:"),
    ...lines.map(paragraph),
    `<p style="margin:0 0 12px"><a href="${escapeHtml(input.feesUrl)}">${escapeHtml(linkText)}</a></p>`,
    paragraph(closing),
  ].join("");
  return { subject, text, html };
}

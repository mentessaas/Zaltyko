/**
 * Cobro automático de cuotas (Fase 3): aviso a la familia cuando falla el
 * primer cobro de una cuota. Decisión de Elvis D3 (17-11-2026): la familia
 * recibe un correo con el enlace a /familia/cuotas para revisar su tarjeta, y
 * la academia ve la incidencia en su lista de cobros.
 *
 * Reglas:
 * - solo el intento 1: los reintentos y las reanudaciones nunca avisan otra vez;
 * - avisa un fallo de verdad en Stripe y también el cierre del intento 1
 *   porque la tarjeta guardada ya no está en Stripe (`resource_missing` al
 *   crear el cobro): la familia tiene que volver a guardarla (ruling R8);
 * - un solo aviso por intento: la clave del outbox es
 *   `family-collection:{id del intento}:family_failure_notice`;
 * - el outbox solo lleva ids (intento y factura), nunca datos de la familia;
 * - el texto nunca promete un reintento que no vaya a ocurrir (política de
 *   reintentos de retry-policy.ts) y nunca enlaza el cobro de Stripe del
 *   intento cerrado: solo /familia/cuotas;
 * - Fase 4, D11 («el mismo correo que con tarjeta, sin prometer reintento»):
 *   una domiciliación que el banco rechaza días después (llega por un evento
 *   de Stripe o por la relectura diaria) avisa igual que una tarjeta
 *   rechazada, con el tipo `sepa_failed`: la domiciliación nunca se reintenta,
 *   así que su texto nunca habla de otro intento;
 * - Fase 4, D7 («un correo cada vez que el banco pida confirmar»): cuando el
 *   banco pide que la familia confirme el pago, el intento queda
 *   `requires_action` con su plazo y se avisa en ese momento, en cualquier
 *   número de intento, con la misma clave por intento. Si el plazo pasa y el
 *   intento acaba `failed`, esa clave impide un segundo correo.
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
 *   cambió, ventana de cobro pasada…): no es un cobro fallido (el único
 *   cierre que avisa es el de la tarjeta que ya no está: notifiesFamilyOnCancel);
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
 * Motivo con el que se cierra (`canceled`) un intento cuyo cobro Stripe se
 * negó a crear porque el cliente o el método de pago de la familia ya no
 * existen en la cuenta de la academia (finalCreateErrorCode). El mismo código
 * que da Stripe: aquí no se importa la capa que lo decide.
 */
export const PAYMENT_METHOD_MISSING_CODE = "resource_missing";

/**
 * ¿Este cierre (`canceled`) avisa a la familia? Solo el del intento 1 porque
 * su tarjeta ya no está en Stripe: no es un rechazo del banco, pero sin
 * avisarla no sabría que tiene que volver a guardarla. Los demás cierres (la
 * puerta, la academia, la ventana de cobro…) nunca avisan.
 */
export function notifiesFamilyOnCancel(input: { attemptNumber: number; reason: string }): boolean {
  return (
    input.attemptNumber === FAMILY_FAILURE_NOTICE_ATTEMPT_NUMBER && input.reason === PAYMENT_METHOD_MISSING_CODE
  );
}

/**
 * ¿El intento, tal como está, avisa a la familia? Cerrado (`failed` o
 * `canceled`) según las reglas de arriba, o (Fase 4) esperando a que la
 * familia confirme el pago con su banco (`requires_action`), en cualquier
 * número de intento, solo mientras su plazo no haya pasado (`now`; sin plazo
 * conocido, no).
 */
export function familyNoticeApplies(input: {
  attemptNumber: number;
  status: string;
  failureCode: string | null;
  actionDeadlineAt?: Date | null;
  now?: Date;
}): boolean {
  if (input.status === "requires_action") {
    const deadline = input.actionDeadlineAt?.getTime();
    return (
      deadline !== undefined &&
      Number.isFinite(deadline) &&
      input.now !== undefined &&
      input.now.getTime() <= deadline
    );
  }
  if (input.status === "failed") {
    return notifiesFamilyOnFailure({ attemptNumber: input.attemptNumber, failureCode: input.failureCode ?? "" });
  }
  if (input.status === "canceled") {
    return notifiesFamilyOnCancel({ attemptNumber: input.attemptNumber, reason: input.failureCode ?? "" });
  }
  return false;
}

/**
 * Qué se le cuenta a la familia:
 * - `retry_scheduled`: tarjeta con rechazo recuperable y reintento programado;
 * - `authentication_required`: el banco pide que la persona confirme el pago.
 *   Con plazo (Fase 4, intento `requires_action`: `deadlineLocalDate` en
 *   renderFamilyFailureNotice), se le pide que lo confirme en Zaltyko antes
 *   de ese día; sin plazo (Fase 3, o el plazo ya pasó), la cuota pasa a
 *   cobrarse a mano;
 * - `card_declined`: tarjeta rechazada sin reintento;
 * - `sepa_failed`: domiciliación rechazada por el banco (nunca hay
 *   reintentos, D11): el mismo correo que `card_declined`, sin prometer otro
 *   intento;
 * - `card_missing`: la tarjeta guardada ya no está en Stripe (hay que volver
 *   a guardarla); `payment_method_missing`, lo mismo con otra forma de pago;
 * - `not_collected`: no se pudo confirmar el cobro (sin pedir que revise nada);
 * - `confirmation_pending` (Fase 4, Tarea 5): aviso del intento 1 cuando el
 *   reintento ya salió y el banco pide que la familia lo confirme (intento
 *   posterior `requires_action`). Sin promesa de otro intento: se le pide que
 *   confirme el pago en Zaltyko. No lo devuelve familyFailureNoticeKind: lo
 *   elige el envío (decideFamilyFailureNotice).
 */
export type FamilyFailureNoticeKind =
  | "retry_scheduled"
  | "confirmation_pending"
  | "authentication_required"
  | "card_declined"
  | "sepa_failed"
  | "card_missing"
  | "payment_method_missing"
  | "not_collected";

export function familyFailureNoticeKind(input: {
  paymentMethodKind: string | null;
  failureCode: string | null;
  declineCode: string | null;
  /** El intento guardó `next_retry_at`. */
  retryScheduled: boolean;
  /** Estado del intento; con `requires_action` (Fase 4) siempre `authentication_required`. */
  attemptStatus?: string;
}): FamilyFailureNoticeKind {
  if (input.attemptStatus === "requires_action") return "authentication_required";
  if (input.failureCode === PAYMENT_METHOD_MISSING_CODE) {
    return input.paymentMethodKind === "card" ? "card_missing" : "payment_method_missing";
  }
  // D11: cualquier fallo de una domiciliación (sin reintento ni promesa de él).
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

/**
 * Etiqueta común del mes de una cuota (C16): «Cuota de noviembre de 2026» a
 * partir del primer día del periodo (YYYY-MM-DD); null si no se puede leer.
 * La usan el correo a la familia (feeLabel), la cuota nueva de una
 * domiciliación devuelta (Tarea 7) y, después, los paneles (Tarea 11).
 */
export function feePeriodLabel(servicePeriodStart: string | null): string | null {
  const parts = monthOf(servicePeriodStart);
  return parts ? `Cuota de ${parts.month} de ${parts.year}` : null;
}

/** «la cuota de noviembre de 2026» a partir del primer día del periodo; si no se puede, «tu cuota». */
export function feeLabel(servicePeriodStart: string | null): string {
  const label = feePeriodLabel(servicePeriodStart);
  return label ? `la c${label.slice(1)}` : "tu cuota";
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
  retryDay: string | null,
  deadlineDay: string | null
): { lines: string[]; linkText: string } {
  // Fase 4: el banco pide confirmar y la familia aún está a tiempo.
  if (kind === "authentication_required" && deadlineDay) {
    return {
      lines: [
        `Tu banco pide que confirmes el pago de ${fee}. Entra en Zaltyko y pulsa «Confirmar el pago» antes del ${deadlineDay}. Si no, tu academia te dirá cómo pagarla.`,
      ],
      linkText: "Entrar en Zaltyko",
    };
  }
  switch (kind) {
    case "confirmation_pending":
      return {
        lines: [
          `No hemos podido cobrar con tu tarjeta ${fee} a la primera. Al volver a intentarlo, tu banco pide que confirmes tú el pago.`,
          "Entra en Zaltyko y pulsa «Confirmar el pago» en esa cuota. Si no lo confirmas a tiempo, tu academia te dirá cómo pagarla.",
        ],
        linkText: "Entrar en Zaltyko",
      };
    case "retry_scheduled":
      return {
        lines: [
          `No hemos podido cobrar con tu tarjeta ${fee}. El banco no lo ha aceptado esta vez.`,
          retryDay
            ? `Volveremos a intentarlo el ${retryDay} con la tarjeta que tengas guardada. Si quieres usar otra, cámbiala antes en Zaltyko.`
            : "Volveremos a intentarlo pronto con la tarjeta que tengas guardada. Si quieres usar otra, cámbiala cuanto antes en Zaltyko.",
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
    case "card_missing":
      return {
        lines: [
          `No hemos podido cobrar con tu tarjeta ${fee}: la tarjeta que tenías guardada ya no está disponible.`,
          NOT_AUTOMATIC_ANYMORE,
          "Para que las próximas cuotas se cobren solas, vuelve a guardar tu tarjeta en Zaltyko.",
        ],
        linkText: "Actualizar mi tarjeta",
      };
    case "payment_method_missing":
      return {
        lines: [
          `No hemos podido cobrar ${fee}: la forma de pago que tenías guardada ya no está disponible.`,
          NOT_AUTOMATIC_ANYMORE,
          "Para que las próximas cuotas se cobren solas, vuelve a guardar tu forma de pago en Zaltyko.",
        ],
        linkText: "Actualizar mi forma de pago",
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
  /**
   * Día local del reintento (YYYY-MM-DD), solo si es futuro; solo cuenta en
   * `retry_scheduled`. Sin él, el reintento se promete sin fecha («pronto»).
   */
  retryDateLocal: string | null;
  /**
   * Fase 4: último día local (YYYY-MM-DD) para confirmar el pago con el banco
   * (de `action_deadline_at`); solo cuenta en `authentication_required`. Sin
   * él, el texto de la Fase 3 (la cuota pasa a cobrarse a mano).
   */
  deadlineLocalDate?: string | null;
  /** URL de /familia/cuotas. */
  feesUrl: string;
}): FamilyFailureNoticeMessage {
  const fee = feeLabel(input.servicePeriodStart);
  const retryDay = retryDayLabel(input.retryDateLocal);
  const deadlineDay = input.kind === "authentication_required" ? retryDayLabel(input.deadlineLocalDate ?? null) : null;
  const academy = input.academyName.trim() || "Tu academia";

  const { lines, linkText } = noticeBody(input.kind, fee, retryDay, deadlineDay);
  const closing = `Si tienes cualquier duda, habla con ${academy}.`;
  // Tarea 5 (M3): el aviso del intento 1 lleva otro asunto que el del intento
  // que espera la confirmación (D7), para que no lleguen dos correos iguales.
  const subject = (
    input.kind === "confirmation_pending"
      ? `${academy}: tu banco pide confirmar el pago de ${fee}`
      : deadlineDay
        ? `${academy}: confirma el pago de ${fee}`
        : `${academy}: no hemos podido cobrar ${fee}`
  ).slice(0, 160);
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

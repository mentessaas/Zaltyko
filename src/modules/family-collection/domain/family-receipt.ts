/**
 * Cobro automático de cuotas (Fase 4, Tarea 9): justificante de pago para la
 * familia. Decisión de Elvis D6 («Sí, apagado hasta abogado»): por correo y en
 * una página imprimible, «no es factura», sin numeración propia, detrás de
 * ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED hasta que conteste el gestor (L6).
 *
 * Reglas:
 * - un justificante por cobro registrado: nace en el outbox, en la misma
 *   transacción que registra el cobro (applyOutcome `succeeded` y
 *   `late_succeeded`), con la clave `family-collection:{intento}:receipt`;
 * - el outbox solo lleva ids (intento, factura y pago), nunca datos de la familia;
 * - el contenido es solo lo que la familia necesita: academia, persona que
 *   paga, cuotas (mes y gimnasta), importes, día del cobro, tipo de pago (sin
 *   números de tarjeta ni de cuenta), la referencia de la cuota que ya ve en
 *   el portal y la frase «Este justificante no es una factura»;
 * - sin número de justificante.
 *
 * Funciones puras: sin base de datos ni correo.
 */
import { escapeHtml } from "@/lib/email/escape-html";
import { formatMoney } from "@/modules/family-portal/domain/family-portal-presentation";

import { feePeriodLabel, retryDayLabel } from "./family-failure-notice";

/** Nombre del paso en el outbox (`family_collection.{paso}`) y en su clave. */
export const FAMILY_RECEIPT = "receipt";
export const FAMILY_RECEIPT_EVENT = `family_collection.${FAMILY_RECEIPT}`;

/** Resultado del envío del justificante (enviado o por qué no): uno por intento. */
export const FAMILY_RECEIPT_RESULT = "receipt_result";
export const FAMILY_RECEIPT_RESULT_EVENT = `family_collection.${FAMILY_RECEIPT_RESULT}`;

/** Plantilla del correo (registro de envíos). */
export const FAMILY_RECEIPT_TEMPLATE = "family_collection_receipt";

/** Página del justificante (portal de la familia). */
export const FAMILY_RECEIPT_PATH = "/familia/cuotas/justificante";

export function familyReceiptKey(attemptId: string): string {
  return `family-collection:${attemptId}:${FAMILY_RECEIPT}`;
}

export function familyReceiptResultKey(attemptId: string): string {
  return `family-collection:${attemptId}:${FAMILY_RECEIPT_RESULT}`;
}

export function familyReceiptPath(attemptId: string): string {
  return `${FAMILY_RECEIPT_PATH}/${attemptId}`;
}

/** Texto obligatorio del justificante. */
export const FAMILY_RECEIPT_NOT_INVOICE = "Este justificante no es una factura.";

export type FamilyReceiptMethod = "card" | "sepa_debit";

/** Una cuota pagada con el cobro. */
export interface FamilyReceiptFee {
  /** «Cuota de noviembre de 2026» (feePeriodLabel) o «Cuota». */
  label: string;
  /** Nombre de la gimnasta, si la cuota es de una sola. */
  athleteName: string | null;
  amountCents: number;
}

/** Lo que enseña la página del justificante (y lleva el correo). */
export interface FamilyReceiptView {
  academyName: string;
  payerName: string;
  fees: FamilyReceiptFee[];
  totalCents: number;
  currency: "EUR";
  /** Día local del cobro (YYYY-MM-DD, zona de la sede). */
  collectedOnLocal: string;
  method: FamilyReceiptMethod;
  /** Referencia de la cuota, la misma que la familia ve en el portal. */
  reference: string;
}

/** Etiqueta de una cuota del justificante a partir del primer día de su periodo. */
export function familyReceiptFeeLabel(servicePeriodStart: string | null): string {
  return feePeriodLabel(servicePeriodStart) ?? "Cuota";
}

/** «Tarjeta» o «Domiciliación bancaria»: nunca números. */
export function familyReceiptMethodText(method: FamilyReceiptMethod): string {
  return method === "sepa_debit" ? "Domiciliación bancaria" : "Tarjeta";
}

/** «18 de noviembre de 2026» a partir de YYYY-MM-DD; si no se puede, el texto tal cual. */
export function familyReceiptDateText(localDate: string): string {
  const day = retryDayLabel(localDate);
  return day ? `${day} de ${localDate.slice(0, 4)}` : localDate;
}

/** «Cuota de noviembre de 2026 · Lucía». */
export function familyReceiptFeeLine(fee: Pick<FamilyReceiptFee, "label" | "athleteName">): string {
  const athlete = fee.athleteName?.trim();
  return athlete ? `${fee.label} · ${athlete}` : fee.label;
}

/** Academia tal como sale en el texto (nunca vacía). */
function academyOf(name: string): string {
  return name.trim() || "tu academia";
}

/** Frase final: no es factura y a quién pedirla. */
export function familyReceiptNotInvoiceText(academyName: string): string {
  return `${FAMILY_RECEIPT_NOT_INVOICE} Si necesitas factura, pídesela a ${academyOf(academyName)}.`;
}

/** Filas del justificante (etiqueta y valor), las mismas en el correo y en la página. Pura. */
export function familyReceiptRows(view: FamilyReceiptView): Array<{ label: string; value: string }> {
  return [
    { label: "Academia", value: academyOf(view.academyName) },
    ...(view.payerName.trim() ? [{ label: "Pagado por", value: view.payerName.trim() }] : []),
    { label: "Fecha del cobro", value: familyReceiptDateText(view.collectedOnLocal) },
    { label: "Forma de pago", value: familyReceiptMethodText(view.method) },
    { label: "Referencia de la cuota", value: view.reference },
  ];
}

export interface FamilyReceiptMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * Correo del justificante. Asunto «Justificante de pago de {academia}»; lleva
 * las cuotas, el total, el día, el tipo de pago, el enlace a la página
 * imprimible y la frase «Este justificante no es una factura…».
 */
export function renderFamilyReceipt(input: {
  academyName: string;
  payerName: string;
  fees: { label: string; athleteName: string | null; amountCents: number }[];
  totalCents: number;
  currency: "EUR";
  collectedOnLocal: string;
  method: FamilyReceiptMethod;
  reference: string;
  receiptUrl: string;
}): FamilyReceiptMessage {
  const academy = academyOf(input.academyName);
  const subject = `Justificante de pago de ${academy}`.slice(0, 160);
  const payer = input.payerName.trim();
  const greeting = payer ? `Hola, ${payer}:` : "Hola:";
  const intro = `${academy} ha recibido tu pago. Aquí tienes el justificante.`;
  const rows = familyReceiptRows(input);
  const feeLines = input.fees.map(
    (fee) => `${familyReceiptFeeLine(fee)}: ${formatMoney(fee.amountCents, input.currency)}`
  );
  const total = `Total pagado: ${formatMoney(input.totalCents, input.currency)}`;
  const notInvoice = familyReceiptNotInvoiceText(input.academyName);
  const linkText = "Ver o imprimir el justificante";

  const text = [
    greeting,
    intro,
    rows.map((row) => `${row.label}: ${row.value}`).join("\n"),
    [...feeLines, total].join("\n"),
    `${linkText}: ${input.receiptUrl}`,
    notInvoice,
  ].join("\n\n");

  const paragraph = (value: string) => `<p style="margin:0 0 12px">${escapeHtml(value)}</p>`;
  const list = (lines: string[]) =>
    `<p style="margin:0 0 12px">${lines.map((line) => escapeHtml(line)).join("<br>")}</p>`;
  const html = [
    paragraph(greeting),
    paragraph(intro),
    list(rows.map((row) => `${row.label}: ${row.value}`)),
    list(feeLines),
    `<p style="margin:0 0 12px"><strong>${escapeHtml(total)}</strong></p>`,
    `<p style="margin:0 0 12px"><a href="${escapeHtml(input.receiptUrl)}">${escapeHtml(linkText)}</a></p>`,
    paragraph(notInvoice),
  ].join("");
  return { subject, text, html };
}

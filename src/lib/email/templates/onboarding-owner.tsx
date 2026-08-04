import { escapeHtml } from "../escape-html";

/**
 * Plantilla unica para la secuencia d0/d2/d7 owner (ZAL-314 B1).
 *
 * El integrador escoge la variante de copy segun el step (d0, d2 o d7).
 * Las subjects y preheaders son fijos (no interpolan academy_name) por
 * construccion para cumplir §2+§5 de la spec sin riesgo de longitud.
 *
 * Escape HTML en TODA interpolacion de variable de usuario (B4):
 * - owner_first_name
 * - academy_name
 * - next_step_label
 * Las URLs se asumen validadas por `buildNextStepUrl`/`buildHttpsUrlInAllowlist`
 * antes de pasar al template (B5); aqui se escapan por defensa en profundidad.
 */

export type OnboardingOwnerStep = "d0" | "d2" | "d7";

interface StepCopy {
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  ctaLabel: string;
  closing: string;
}

const STEP_COPY: Record<OnboardingOwnerStep, StepCopy> = {
  d0: {
    subject: "Tu academia en Zaltyko ya está lista",
    preheader: "Entra al panel y continúa desde la siguiente tarea pendiente.",
    headline: "Tu academia está lista",
    intro:
      "Acabamos de crear tu panel. Solo te queda una tarea para terminar la configuración inicial:",
    ctaLabel: "Continuar",
    closing:
      "Si te atascas, responde a este correo y te echamos una mano.",
  },
  d2: {
    subject: "Siguiente paso para configurar tu academia",
    preheader:
      "Tu progreso está guardado; retoma la configuración donde la dejaste.",
    headline: "Continúa donde lo dejaste",
    intro:
      "Llevas un par de días sin entrar al panel. Tu academia sigue esperándote con esta tarea pendiente:",
    ctaLabel: "Continuar",
    closing:
      "Tu progreso está guardado, puedes parar y retomar cuando quieras.",
  },
  d7: {
    subject: "Último recordatorio de tu configuración",
    preheader:
      "Cerramos esta secuencia; tu progreso seguirá guardado en Zaltyko.",
    headline: "Última llamada",
    intro:
      "Esta es la última comunicación automática de esta secuencia. Si todavía te queda esta tarea, te dejamos el enlace directo:",
    ctaLabel: "Continuar",
    closing:
      "Después de este correo dejamos de enviarte recordatorios. Tu academia y tu progreso seguirán aquí cuando vuelvas.",
  },
};

export interface OnboardingOwnerTemplateInput {
  step: OnboardingOwnerStep;
  ownerFirstName: string;
  academyName: string;
  nextStepLabel: string;
  /** URL HTTPS absoluta en allowlist Zaltyko. `null` cuando ya no hay tareas pendientes. */
  nextStepUrl: string | null;
  /** URL HTTPS absoluta a preferencias de notificacion (d7). Opcional en d0/d2. */
  preferencesUrl?: string | null;
  /** URL HTTPS absoluta para dar de baja la secuencia (d7). Opcional en d0/d2. */
  unsubscribeUrl?: string | null;
}

export function OnboardingOwnerTemplate({
  step,
  ownerFirstName,
  academyName,
  nextStepLabel,
  nextStepUrl,
  preferencesUrl,
  unsubscribeUrl,
}: OnboardingOwnerTemplateInput) {
  const copy = STEP_COPY[step];
  // Escape defensivo: aunque `nextStepUrl`/`preferencesUrl`/`unsubscribeUrl`
  // llegan validados por allowlist, escapamos por si el caller pasa un valor
  // crudo en tests o en un futuro flujo no-allowlisted.
  const safeOwnerFirstName = escapeHtml(ownerFirstName || "");
  const safeAcademyName = escapeHtml(academyName || "");
  const safeNextStepLabel = escapeHtml(nextStepLabel || "");
  const safeNextStepUrl = nextStepUrl ? escapeHtml(nextStepUrl) : null;
  const safePreferencesUrl = preferencesUrl ? escapeHtml(preferencesUrl) : null;
  const safeUnsubscribeUrl = unsubscribeUrl ? escapeHtml(unsubscribeUrl) : null;

  const showPreferences = step === "d7" && Boolean(safePreferencesUrl);
  const showUnsubscribe = step === "d7" && Boolean(safeUnsubscribeUrl);
  const showCta = Boolean(safeNextStepUrl);

  const ctaBlock = showCta
    ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${safeNextStepUrl}" style="display: inline-block; padding: 14px 28px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">${escapeHtml(copy.ctaLabel)}: ${safeNextStepLabel}</a>
      </div>
      `
    : "";

  const footerLinks = showPreferences || showUnsubscribe
    ? `
        <p style="margin: 0 0 6px 0;">
          ${showPreferences && safePreferencesUrl ? `<a href="${safePreferencesUrl}" style="color: #6b7280; text-decoration: underline;">Preferencias de notificación</a> &middot; ` : ""}
          ${showUnsubscribe && safeUnsubscribeUrl ? `<a href="${safeUnsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Dar de baja esta secuencia</a>` : ""}
        </p>
      `
    : "";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <span style="display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; color: #f5f5f5; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${escapeHtml(copy.preheader)}</span>
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background-color: #4f46e5; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">${escapeHtml(copy.headline)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Hola <strong>${safeOwnerFirstName}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                ${escapeHtml(copy.intro)}
              </p>
              ${ctaBlock}
              ${!showCta
                ? `<p style="margin: 20px 0; padding: 14px 16px; background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 6px; color: #065f46; font-size: 15px; line-height: 1.5;">
                    Has completado todos los pasos de configuración inicial de <strong>${safeAcademyName}</strong>. Enhorabuena.
                  </p>`
                : ""}
              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                ${escapeHtml(copy.closing)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; text-align: center; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 6px 0; color: #6b7280; font-size: 12px;">
                Zaltyko · onboarding transaccional · este correo es para <strong>${safeAcademyName}</strong>
              </p>
              ${footerLinks}
              <p style="margin: 6px 0 0 0; color: #9ca3af; font-size: 11px;">
                ${step === "d7"
                  ? "Cerramos esta secuencia; no recibirás más recordatorios automáticos."
                  : "Secuencia d0/d2/d7 — solo emails transaccionales, sin tracking de apertura."}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/** Devuelve el subject literal correspondiente al step. */
export function getOnboardingOwnerSubject(step: OnboardingOwnerStep): string {
  return STEP_COPY[step].subject;
}

/** Devuelve el preheader literal correspondiente al step. */
export function getOnboardingOwnerPreheader(step: OnboardingOwnerStep): string {
  return STEP_COPY[step].preheader;
}

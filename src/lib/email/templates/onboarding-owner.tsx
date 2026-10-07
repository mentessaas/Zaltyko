import { escapeHtml } from "../escape-html";
import {
  pickLocalized,
  resolveOwnerLocale,
  type SupportedLocale,
} from "@/lib/onboarding/template-helpers";

export type OnboardingOwnerStep = "d0" | "d2" | "d7";

type Copy = {
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  cta: string;
  closing: string;
  preferences: string;
  unsubscribe: string;
  completed: string;
};

const COPY: Record<OnboardingOwnerStep, Record<SupportedLocale, Copy>> = {
  d0: {
    es: {
      subject: "Pongamos tu academia en ritmo",
      preheader: "Sigue con el próximo paso de configuración.",
      headline: "Un paso cada vez",
      intro:
        "Tu academia ya tiene un espacio en Zaltyko. Sigue con esta tarea pendiente:",
      cta: "Continuar",
      closing: "Tu avance queda guardado. Cuando vuelvas, seguimos desde aquí.",
      preferences: "Preferencias de notificación",
      unsubscribe: "Dar de baja esta secuencia",
      completed: "Has completado todos los pasos de configuración inicial.",
    },
    en: {
      subject: "Your academy is ready in Zaltyko",
      preheader: "Continue with the next pending task.",
      headline: "Your academy is ready",
      intro: "We have created your dashboard. Here is the next pending task:",
      cta: "Continue",
      closing: "Your progress is saved whenever you want to come back.",
      preferences: "Notification preferences",
      unsubscribe: "Unsubscribe from this sequence",
      completed: "You have completed all initial setup steps.",
    },
  },
  d2: {
    es: {
      subject: "Siguiente paso para configurar tu academia",
      preheader: "Continúa con la configuración cuando te venga bien.",
      headline: "Continúa a tu ritmo",
      intro: "Tu academia sigue aquí. Esta es la siguiente tarea pendiente:",
      cta: "Continuar",
      closing: "No hace falta configurarlo todo hoy. Tu avance queda guardado.",
      preferences: "Preferencias de notificación",
      unsubscribe: "Dar de baja esta secuencia",
      completed: "Has completado todos los pasos de configuración inicial.",
    },
    en: {
      subject: "The next step for your academy",
      preheader: "Pick up setup where you left off.",
      headline: "Continue where you left off",
      intro: "Your academy is waiting with this pending task:",
      cta: "Continue",
      closing: "Your progress is saved whenever you want to come back.",
      preferences: "Notification preferences",
      unsubscribe: "Unsubscribe from this sequence",
      completed: "You have completed all initial setup steps.",
    },
  },
  d7: {
    es: {
      subject: "Tu academia seguirá aquí cuando quieras continuar",
      preheader: "Este es el último mensaje de esta secuencia de configuración.",
      headline: "Tu avance queda guardado",
      intro: "Este es el último mensaje de esta secuencia. Esta es la tarea pendiente:",
      cta: "Continuar",
      closing: "Después de este correo no recibirás más recordatorios automáticos de esta secuencia.",
      preferences: "Preferencias de notificación",
      unsubscribe: "Dar de baja esta secuencia",
      completed: "Has completado todos los pasos de configuración inicial.",
    },
    en: {
      subject: "Final setup reminder",
      preheader: "This sequence is ending; your progress will stay saved.",
      headline: "Final reminder",
      intro: "This is the final automated message in this sequence:",
      cta: "Continue",
      closing:
        "You will not receive more automated reminders after this email.",
      preferences: "Notification preferences",
      unsubscribe: "Unsubscribe from this sequence",
      completed: "You have completed all initial setup steps.",
    },
  },
};

export interface OnboardingOwnerTemplateInput {
  step: OnboardingOwnerStep;
  locale?: string | null;
  ownerFirstName: string;
  academyName: string;
  nextStepLabel: string;
  nextStepUrl: string | null;
  preferencesUrl: string;
  unsubscribeUrl: string;
}

export function getOnboardingOwnerCopy(
  step: OnboardingOwnerStep,
  locale?: string | null
): Copy {
  return COPY[step][resolveOwnerLocale(locale)];
}

export function getOnboardingOwnerSubject(
  step: OnboardingOwnerStep,
  locale?: string | null
): string {
  return getOnboardingOwnerCopy(step, locale).subject;
}

export function OnboardingOwnerTemplate(
  input: OnboardingOwnerTemplateInput
): string {
  const locale = resolveOwnerLocale(input.locale);
  const copy = getOnboardingOwnerCopy(input.step, locale);
  const esc = (value: string) => escapeHtml(value ?? "");
  const brandLine = locale === "en" ? "Your academy, in rhythm." : "Tu academia, en ritmo.";
  const cta = input.nextStepUrl
    ? `<p style="margin:28px 0"><a href="${esc(input.nextStepUrl)}" style="display:inline-block;background:#146F68;color:#FFFFFF;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700">${esc(copy.cta)}: ${esc(input.nextStepLabel)}</a></p>`
    : `<p style="padding:16px;background:#E8F1EB;border-radius:10px;color:#16243A">${esc(copy.completed)} <strong>${esc(input.academyName)}</strong></p>`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(copy.subject)}</title></head><body style="margin:0;background:#F8F7F3;font-family:Arial,Helvetica,sans-serif;color:#16243A"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(copy.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F7F3;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border:1px solid #DEDCD3;border-radius:18px;overflow:hidden"><tr><td style="background:#16243A;padding:24px 32px"><p style="margin:0;color:#D5E776;font-size:13px;font-weight:700;letter-spacing:2px">ZALTYKO</p><p style="margin:8px 0 0;color:#FFFFFF;font-size:13px">${esc(brandLine)}</p></td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 20px;color:#16243A;font-size:28px;line-height:1.2">${esc(copy.headline)}</h1><p style="margin:0 0 16px;color:#53616B;font-size:16px;line-height:1.65">${locale === "en" ? "Hello" : "Hola"} <strong style="color:#16243A">${esc(input.ownerFirstName)}</strong>,</p><p style="margin:0;color:#53616B;font-size:16px;line-height:1.65">${esc(copy.intro)}</p>${cta}<p style="margin:24px 0 0;color:#53616B;font-size:14px;line-height:1.6">${esc(copy.closing)}</p></td></tr><tr><td style="border-top:1px solid #DEDCD3;padding:20px 32px"><p style="margin:0 0 10px;color:#53616B;font-size:12px;line-height:1.6">Zaltyko · ${locale === "en" ? "Setup for" : "Configuración de"} <strong>${esc(input.academyName)}</strong></p><p style="margin:0;color:#53616B;font-size:12px;line-height:1.8"><a href="${esc(input.preferencesUrl)}" style="color:#146F68">${esc(copy.preferences)}</a> · <a href="${esc(input.unsubscribeUrl)}" style="color:#146F68">${esc(copy.unsubscribe)}</a></p></td></tr></table></td></tr></table></body></html>`;
}

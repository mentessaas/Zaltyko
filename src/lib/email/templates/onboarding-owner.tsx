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
      subject: "Tu academia en Zaltyko ya está lista",
      preheader: "Continúa desde la siguiente tarea pendiente.",
      headline: "Tu academia está lista",
      intro:
        "Acabamos de crear tu panel. Esta es la siguiente tarea pendiente:",
      cta: "Continuar",
      closing: "Tu progreso queda guardado para cuando quieras retomarlo.",
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
      preheader: "Retoma la configuración donde la dejaste.",
      headline: "Continúa donde lo dejaste",
      intro: "Tu academia sigue esperándote con esta tarea pendiente:",
      cta: "Continuar",
      closing: "Tu progreso queda guardado y puedes retomarlo cuando quieras.",
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
      subject: "Último recordatorio de tu configuración",
      preheader: "Cerramos esta secuencia; tu progreso seguirá guardado.",
      headline: "Último recordatorio",
      intro: "Esta es la última comunicación automática de esta secuencia:",
      cta: "Continuar",
      closing:
        "Después de este correo no recibirás más recordatorios automáticos.",
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
  const copy = getOnboardingOwnerCopy(input.step, input.locale);
  const esc = (value: string) => escapeHtml(value ?? "");
  const cta = input.nextStepUrl
    ? `<p><a href="${esc(input.nextStepUrl)}">${esc(copy.cta)}: ${esc(input.nextStepLabel)}</a></p>`
    : `<p>${esc(copy.completed)} <strong>${esc(input.academyName)}</strong></p>`;
  return `<!doctype html><html lang="${resolveOwnerLocale(input.locale)}"><head><meta charset="utf-8"><title>${esc(copy.subject)}</title></head><body><main><h1>${esc(copy.headline)}</h1><p>Hola <strong>${esc(input.ownerFirstName)}</strong>,</p><p>${esc(copy.intro)}</p>${cta}<p>${esc(copy.closing)}</p></main><footer><a href="${esc(input.preferencesUrl)}">${esc(copy.preferences)}</a> · <a href="${esc(input.unsubscribeUrl)}">${esc(copy.unsubscribe)}</a><p>Zaltyko · comunicación transaccional de onboarding para <strong>${esc(input.academyName)}</strong>.</p></footer></body></html>`;
}

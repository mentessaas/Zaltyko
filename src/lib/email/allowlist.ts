import {
  NEXT_STEP_URLS,
  type NextStepKey,
} from "@/lib/onboarding/next-step-urls";

const ZALTYKO_HOST = /(^|\.)zaltyko\.com$/i;

const ACADEMY_STEP_PATHS: Partial<Record<NextStepKey, string>> = {
  add_5_athletes: "/athletes/new",
  create_first_group: "/groups",
  setup_weekly_schedule: "/classes",
  invite_first_coach: "/coaches",
  enable_payments: "/settings?tab=billing",
  send_first_communication: "/comms",
  login_again: "/dashboard",
};

function getBaseUrl(): URL | null {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://zaltyko.com";
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      !ZALTYKO_HOST.test(url.hostname) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function validAcademyId(academyId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    academyId
  );
}

export interface AllowlistedUrlResult {
  ok: boolean;
  url: string | null;
  reason?: "INVALID_STEP_KEY" | "INVALID_ACADEMY_ID" | "HTTPS_REQUIRED";
}

/** Construye el CTA contra las rutas modernas `/app/[academyId]/*`. */
export function buildNextStepUrl({
  stepKey,
  academyId,
}: {
  stepKey: string;
  academyId: string;
}): AllowlistedUrlResult {
  if (!validAcademyId(academyId)) {
    return { ok: false, url: null, reason: "INVALID_ACADEMY_ID" };
  }
  if (!Object.prototype.hasOwnProperty.call(NEXT_STEP_URLS, stepKey)) {
    return { ok: false, url: null, reason: "INVALID_STEP_KEY" };
  }
  const base = getBaseUrl();
  if (!base) return { ok: false, url: null, reason: "HTTPS_REQUIRED" };

  const relative = ACADEMY_STEP_PATHS[stepKey as NextStepKey];
  const path = relative
    ? `/app/${academyId}${relative}`
    : NEXT_STEP_URLS[stepKey as NextStepKey];
  const url = new URL(path, base);
  if (url.protocol !== "https:" || !ZALTYKO_HOST.test(url.hostname)) {
    return { ok: false, url: null, reason: "HTTPS_REQUIRED" };
  }
  return { ok: true, url: url.toString() };
}

/** Valida un path interno antes de usarlo en un enlace de email. */
export function buildHttpsUrlInAllowlist(path: string): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  const base = getBaseUrl();
  if (!base) return null;
  const url = new URL(path, base);
  return url.protocol === "https:" && ZALTYKO_HOST.test(url.hostname)
    ? url.toString()
    : null;
}

export const ONBOARDING_OWNER_DONE_KEY = "done" as const;
export type OnboardingOwnerStepKey =
  | NextStepKey
  | typeof ONBOARDING_OWNER_DONE_KEY;

/**
 * Lógica de la invitación «Añadir Zaltyko a tu pantalla de inicio».
 * Discreta: no a la primera visita, no si ya está instalada, y si se
 * descarta no vuelve en un mes (y se deja de mostrar tras tres veces).
 */

export type InstallPlatform = "android" | "ios-safari" | "ios-other" | "other";

export const HINT_STORAGE_KEY = "zaltyko:add-to-home";
export const MIN_VISIT_DAYS = 2;
export const SNOOZE_DAYS = 30;
export const MAX_DISMISSALS = 3;

export interface HintState {
  /** Días distintos (AAAA-MM-DD) en que se abrió la app. */
  visitDays: string[];
  dismissals: number;
  /** ISO de la última vez que se descartó. */
  lastDismissedAt: string | null;
  /** Ya se instaló desde la invitación. */
  installed: boolean;
}

export const EMPTY_HINT_STATE: HintState = {
  visitDays: [],
  dismissals: 0,
  lastDismissedAt: null,
  installed: false,
};

export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent || "";
  // iPadOS 13+ se presenta como Mac: se distingue por la pantalla táctil.
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (isIos) {
    const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
    return isOtherBrowser ? "ios-other" : "ios-safari";
  }
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function parseHintState(raw: string | null): HintState {
  if (!raw) return { ...EMPTY_HINT_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<HintState>;
    return {
      visitDays: Array.isArray(parsed.visitDays)
        ? parsed.visitDays.filter((d): d is string => typeof d === "string").slice(-10)
        : [],
      dismissals: typeof parsed.dismissals === "number" ? parsed.dismissals : 0,
      lastDismissedAt: typeof parsed.lastDismissedAt === "string" ? parsed.lastDismissedAt : null,
      installed: parsed.installed === true,
    };
  } catch {
    return { ...EMPTY_HINT_STATE };
  }
}

export function recordVisit(state: HintState, now: Date): HintState {
  const day = now.toISOString().slice(0, 10);
  if (state.visitDays.includes(day)) return state;
  return { ...state, visitDays: [...state.visitDays, day].slice(-10) };
}

export function recordDismissal(state: HintState, now: Date): HintState {
  return { ...state, dismissals: state.dismissals + 1, lastDismissedAt: now.toISOString() };
}

export interface HintContext {
  platform: InstallPlatform;
  /** Ya está abierta como app instalada. */
  standalone: boolean;
  /** Android: el navegador ofrece instalar (`beforeinstallprompt`). */
  canPromptInstall: boolean;
  now: Date;
}

export function shouldShowHint(state: HintState, context: HintContext): boolean {
  if (context.standalone || state.installed) return false;
  if (state.dismissals >= MAX_DISMISSALS) return false;
  if (state.visitDays.length < MIN_VISIT_DAYS) return false;

  if (state.lastDismissedAt) {
    const since = context.now.getTime() - Date.parse(state.lastDismissedAt);
    if (!Number.isNaN(since) && since < SNOOZE_DAYS * 86_400_000) return false;
  }

  switch (context.platform) {
    case "android":
      // Sin el aviso del navegador no hay botón de instalar que ofrecer.
      return context.canPromptInstall;
    case "ios-safari":
    case "ios-other":
      return true;
    default:
      return false;
  }
}

export type InstallOutcome = "accepted" | "dismissed";

/**
 * Cerrar el aviso del propio navegador cuenta como descartar la invitación
 * (si no, volvería a aparecer enseguida); aceptarlo la apaga para siempre.
 */
export function recordInstallOutcome(state: HintState, outcome: InstallOutcome | null, now: Date): HintState {
  if (outcome === "accepted") return { ...state, installed: true };
  if (outcome === "dismissed") return recordDismissal(state, now);
  return state;
}

/** Pantallas de pasar lista: ahí no se interrumpe a la entrenadora con invitaciones. */
export function isAttendanceRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /\/attendance\/today(?:\/|$)/.test(pathname) || pathname.startsWith("/pasar-lista-sin-conexion");
}

/**
 * Rutas donde la invitación general («Instalar Zaltyko», solo web pública)
 * no se muestra: acceso, zona privada y pantalla de pasar lista sin conexión.
 */
export function isInstallPromptSuppressedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/pasar-lista-sin-conexion")
  );
}

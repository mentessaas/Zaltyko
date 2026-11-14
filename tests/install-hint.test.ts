import { describe, expect, it } from "vitest";

import {
  EMPTY_HINT_STATE,
  detectPlatform,
  parseHintState,
  recordDismissal,
  recordVisit,
  shouldShowHint,
  type HintState,
} from "@/lib/pwa/install-hint";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

const now = new Date("2026-11-14T10:00:00Z");
const twoDays: HintState = { ...EMPTY_HINT_STATE, visitDays: ["2026-11-13", "2026-11-14"] };

describe("detectPlatform", () => {
  it("distingue Android, Safari de iOS y otros navegadores de iOS", () => {
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform(IPHONE_SAFARI)).toBe("ios-safari");
    expect(detectPlatform(IPHONE_CHROME)).toBe("ios-other");
    expect(detectPlatform(DESKTOP)).toBe("other");
  });
  it("reconoce iPad que se presenta como Mac", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe("ios-safari");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)).toBe("other");
  });
});

describe("shouldShowHint", () => {
  const base = { platform: "ios-safari" as const, standalone: false, canPromptInstall: false, now };

  it("no a la primera visita", () => {
    expect(shouldShowHint(recordVisit(EMPTY_HINT_STATE, now), base)).toBe(false);
  });
  it("sí desde la segunda visita en otro día", () => {
    expect(shouldShowHint(twoDays, base)).toBe(true);
  });
  it("no si ya está instalada", () => {
    expect(shouldShowHint(twoDays, { ...base, standalone: true })).toBe(false);
    expect(shouldShowHint({ ...twoDays, installed: true }, base)).toBe(false);
  });
  it("Android solo si el navegador ofrece instalar", () => {
    expect(shouldShowHint(twoDays, { ...base, platform: "android", canPromptInstall: false })).toBe(false);
    expect(shouldShowHint(twoDays, { ...base, platform: "android", canPromptInstall: true })).toBe(true);
  });
  it("nunca en escritorio", () => {
    expect(shouldShowHint(twoDays, { ...base, platform: "other", canPromptInstall: true })).toBe(false);
  });
  it("tras descartar espera 30 días y tras tres descartes no vuelve", () => {
    const dismissed = recordDismissal(twoDays, now);
    expect(shouldShowHint(dismissed, base)).toBe(false);
    const later = new Date("2026-12-15T10:00:00Z");
    expect(shouldShowHint(dismissed, { ...base, now: later })).toBe(true);
    const thrice = { ...dismissed, dismissals: 3 };
    expect(shouldShowHint(thrice, { ...base, now: new Date("2027-06-01T00:00:00Z") })).toBe(false);
  });
});

describe("estado guardado", () => {
  it("recordVisit cuenta días distintos, no visitas", () => {
    const once = recordVisit(EMPTY_HINT_STATE, now);
    expect(recordVisit(once, now).visitDays).toHaveLength(1);
  });
  it("parseHintState aguanta basura", () => {
    expect(parseHintState("{{no json")).toEqual(EMPTY_HINT_STATE);
    expect(parseHintState(null)).toEqual(EMPTY_HINT_STATE);
    expect(parseHintState('{"visitDays":[1,"2026-11-14"],"dismissals":"x"}').visitDays).toEqual(["2026-11-14"]);
  });
});

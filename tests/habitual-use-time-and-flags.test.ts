import { describe, expect, it } from "vitest";

import {
  getAtRiskAlertRecipient,
  isAtRiskAlertsEnabled,
  isCoachRemindersEnabled,
  isHabitualUseEnabled,
  isOwnerWeeklyDigestEnabled,
  isUsageMetricsEnabled,
} from "@/modules/habitual-use/domain/flags";
import {
  digestWeeks,
  isOwnerDigestWindow,
  isQuietHour,
  isoWeekKey,
  localDate,
  localParts,
  localTimeLabel,
  localWeekStart,
  resolveDigestTimezone,
  safeTimezone,
} from "@/modules/habitual-use/domain/local-time";

describe("banderas del uso habitual", () => {
  it("están apagadas por defecto y solo valen con «true»", () => {
    const empty = {};
    expect(isHabitualUseEnabled(empty)).toBe(false);
    expect(isCoachRemindersEnabled(empty)).toBe(false);
    expect(isOwnerWeeklyDigestEnabled(empty)).toBe(false);
    expect(isUsageMetricsEnabled(empty)).toBe(false);
    expect(isAtRiskAlertsEnabled(empty)).toBe(false);
    for (const value of ["1", "TRUE", "yes", "on", " true", ""]) {
      expect(isHabitualUseEnabled({ ZALTYKO_HABITUAL_USE_ENABLED: value })).toBe(false);
    }
  });

  it("cada función necesita el interruptor general además de la suya", () => {
    expect(isCoachRemindersEnabled({ ZALTYKO_COACH_REMINDERS_ENABLED: "true" })).toBe(false);
    expect(
      isCoachRemindersEnabled({ ZALTYKO_HABITUAL_USE_ENABLED: "true", ZALTYKO_COACH_REMINDERS_ENABLED: "true" })
    ).toBe(true);
    expect(isOwnerWeeklyDigestEnabled({ ZALTYKO_HABITUAL_USE_ENABLED: "true" })).toBe(false);
    expect(
      isOwnerWeeklyDigestEnabled({ ZALTYKO_HABITUAL_USE_ENABLED: "true", ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED: "true" })
    ).toBe(true);
    expect(
      isUsageMetricsEnabled({ ZALTYKO_HABITUAL_USE_ENABLED: "true", ZALTYKO_USAGE_METRICS_ENABLED: "true" })
    ).toBe(true);
    expect(isUsageMetricsEnabled({ ZALTYKO_USAGE_METRICS_ENABLED: "true" })).toBe(false);
  });

  it("el aviso de academias en riesgo exige la medición y su propia bandera", () => {
    const base = { ZALTYKO_HABITUAL_USE_ENABLED: "true", ZALTYKO_AT_RISK_ALERTS_ENABLED: "true" };
    expect(isAtRiskAlertsEnabled(base)).toBe(false);
    expect(isAtRiskAlertsEnabled({ ...base, ZALTYKO_USAGE_METRICS_ENABLED: "true" })).toBe(true);
  });

  it("el destinatario del aviso solo sale del entorno y debe ser un correo", () => {
    expect(getAtRiskAlertRecipient({})).toBeNull();
    expect(getAtRiskAlertRecipient({ ZALTYKO_AT_RISK_ALERT_EMAIL: "no-es-correo" })).toBeNull();
    expect(getAtRiskAlertRecipient({ ZALTYKO_AT_RISK_ALERT_EMAIL: "  Alertas@Ejemplo.TEST " })).toBe(
      "alertas@ejemplo.test"
    );
  });
});

describe("horas locales de la sede", () => {
  it("convierte el mismo instante según la zona de la sede", () => {
    const instant = new Date("2026-11-16T07:10:00Z"); // lunes
    expect(localParts(instant, "Europe/Madrid")).toMatchObject({ day: 16, hour: 8, minute: 10, isoWeekday: 1 });
    expect(localParts(instant, "America/Mexico_City")).toMatchObject({ day: 16, hour: 1, minute: 10, isoWeekday: 1 });
    expect(localParts(instant, "Pacific/Auckland")).toMatchObject({ day: 16, hour: 20, isoWeekday: 1 });
    expect(localTimeLabel(new Date("2026-11-16T17:00:00Z"), "Europe/Madrid")).toBe("18:00");
    expect(localTimeLabel(new Date("2026-11-16T17:00:00Z"), "America/Mexico_City")).toBe("11:00");
  });

  it("respeta el cambio de hora de verano de cada zona", () => {
    // Madrid pasa a horario de invierno el 25-10-2026: 18:00 sigue siendo 18:00 local.
    expect(localTimeLabel(new Date("2026-10-24T16:00:00Z"), "Europe/Madrid")).toBe("18:00"); // CEST
    expect(localTimeLabel(new Date("2026-10-26T17:00:00Z"), "Europe/Madrid")).toBe("18:00"); // CET
  });

  it("una zona desconocida cae a Europe/Madrid", () => {
    expect(safeTimezone("Mars/Olympus")).toBe("Europe/Madrid");
    expect(safeTimezone(null)).toBe("Europe/Madrid");
    expect(safeTimezone("America/Mexico_City")).toBe("America/Mexico_City");
  });

  it("la fecha local puede ser distinta de la fecha UTC", () => {
    const instant = new Date("2026-11-16T23:30:00Z");
    expect(localDate(instant, "Europe/Madrid")).toBe("2026-11-17");
    expect(localDate(instant, "America/Mexico_City")).toBe("2026-11-16");
  });

  it("calcula el lunes y la semana ISO de la sede", () => {
    expect(localWeekStart(new Date("2026-11-18T12:00:00Z"), "Europe/Madrid")).toBe("2026-11-16");
    expect(localWeekStart(new Date("2026-11-22T22:30:00Z"), "Europe/Madrid")).toBe("2026-11-16"); // domingo, aún local 22/11 23:30
    expect(localWeekStart(new Date("2026-11-22T23:30:00Z"), "Europe/Madrid")).toBe("2026-11-23"); // ya lunes en Madrid
    expect(isoWeekKey(new Date("2026-11-16T08:00:00Z"), "Europe/Madrid")).toBe("2026-W47");
  });

  it("la semana ISO respeta los bordes de año", () => {
    expect(isoWeekKey(new Date("2026-01-01T12:00:00Z"), "Europe/Madrid")).toBe("2026-W01");
    expect(isoWeekKey(new Date("2024-12-30T12:00:00Z"), "Europe/Madrid")).toBe("2025-W01");
    expect(isoWeekKey(new Date("2021-01-03T12:00:00Z"), "Europe/Madrid")).toBe("2020-W53");
  });

  it("el resumen se envía la mañana del lunes en la sede, no en UTC", () => {
    // Lunes 16-11-2026.
    expect(isOwnerDigestWindow(new Date("2026-11-16T06:59:00Z"), "Europe/Madrid")).toBe(false); // 07:59 local
    expect(isOwnerDigestWindow(new Date("2026-11-16T07:00:00Z"), "Europe/Madrid")).toBe(true); // 08:00 local
    expect(isOwnerDigestWindow(new Date("2026-11-16T10:59:00Z"), "Europe/Madrid")).toBe(true); // 11:59 local
    expect(isOwnerDigestWindow(new Date("2026-11-16T11:00:00Z"), "Europe/Madrid")).toBe(false); // 12:00 local
    // A las 07:00 UTC en Ciudad de México todavía es de madrugada.
    expect(isOwnerDigestWindow(new Date("2026-11-16T07:00:00Z"), "America/Mexico_City")).toBe(false);
    expect(isOwnerDigestWindow(new Date("2026-11-16T14:00:00Z"), "America/Mexico_City")).toBe(true); // 08:00 local
    // Martes por la mañana: nunca.
    expect(isOwnerDigestWindow(new Date("2026-11-17T08:00:00Z"), "Europe/Madrid")).toBe(false);
    // Domingo por la noche en UTC es ya lunes por la mañana en Auckland.
    expect(isOwnerDigestWindow(new Date("2026-11-15T19:30:00Z"), "Pacific/Auckland")).toBe(true);
  });

  it("las dos semanas del resumen son la que acaba de terminar y la anterior", () => {
    expect(digestWeeks(new Date("2026-11-16T08:00:00Z"), "Europe/Madrid")).toEqual({
      current: { from: "2026-11-09", to: "2026-11-16" },
      previous: { from: "2026-11-02", to: "2026-11-09" },
    });
    // Cruza fin de mes y de año.
    expect(digestWeeks(new Date("2027-01-04T09:00:00Z"), "Europe/Madrid")).toEqual({
      current: { from: "2026-12-28", to: "2027-01-04" },
      previous: { from: "2026-12-21", to: "2026-12-28" },
    });
  });

  it("la zona del resumen es la de las sedes si coinciden y la de la academia si no", () => {
    expect(resolveDigestTimezone("Europe/Madrid", ["America/Mexico_City", "America/Mexico_City"])).toBe(
      "America/Mexico_City"
    );
    expect(resolveDigestTimezone("Europe/Madrid", ["America/Mexico_City", "Europe/Madrid"])).toBe("Europe/Madrid");
    expect(resolveDigestTimezone("America/Mexico_City", [])).toBe("America/Mexico_City");
    expect(resolveDigestTimezone(null, [])).toBe("Europe/Madrid");
  });

  it("de madrugada es hora de silencio en la sede", () => {
    expect(isQuietHour(new Date("2026-11-16T21:00:00Z"), "Europe/Madrid")).toBe(true); // 22:00
    expect(isQuietHour(new Date("2026-11-16T20:59:00Z"), "Europe/Madrid")).toBe(false); // 21:59
    expect(isQuietHour(new Date("2026-11-16T05:59:00Z"), "Europe/Madrid")).toBe(true); // 06:59
    expect(isQuietHour(new Date("2026-11-16T06:00:00Z"), "Europe/Madrid")).toBe(false); // 07:00
    expect(isQuietHour(new Date("2026-11-16T06:00:00Z"), "America/Mexico_City")).toBe(true); // 00:00
  });
});

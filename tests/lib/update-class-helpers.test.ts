import { describe, expect, it } from "vitest";

import {
  hasMixedSportConfigGroups,
  normalizeClassApparatus,
  normalizeWeekdays,
  resolveCandidateGroupIds,
  resolveEffectiveSportConfigId,
  resolveFinalSchedule,
} from "@/lib/classes/update-class-helpers";

describe("update-class-helpers", () => {
  it("resuelve grupos candidatos desde groupIds, groupId o grupos actuales", () => {
    expect(resolveCandidateGroupIds({ groupIds: ["a", "a", "b"], currentGroupIds: ["old"] })).toEqual(["a", "b"]);
    expect(resolveCandidateGroupIds({ groupId: "single", currentGroupIds: ["old"] })).toEqual(["single"]);
    expect(resolveCandidateGroupIds({ groupId: null, currentGroupIds: ["old"] })).toEqual([]);
    expect(resolveCandidateGroupIds({ currentGroupIds: ["old", "old"] })).toEqual(["old"]);
  });

  it("resuelve sportConfig efectivo respetando body, grupo unico y fallback actual", () => {
    expect(
      resolveEffectiveSportConfigId({
        requestedSportConfigId: "requested",
        groupSportConfigIds: ["group"],
        currentSportConfigId: "current",
      })
    ).toBe("requested");
    expect(resolveEffectiveSportConfigId({ groupSportConfigIds: ["group"], currentSportConfigId: "current" })).toBe("group");
    expect(resolveEffectiveSportConfigId({ groupSportConfigIds: ["a", "b"], currentSportConfigId: "current" })).toBe("current");
    expect(resolveEffectiveSportConfigId({ groupSportConfigIds: [], currentSportConfigId: null })).toBeNull();
  });

  it("detecta grupos mezclados sin sportConfig explicito", () => {
    expect(hasMixedSportConfigGroups(["a", "b"], undefined)).toBe(true);
    expect(hasMixedSportConfigGroups(["a", "b"], "explicit")).toBe(false);
    expect(hasMixedSportConfigGroups(["a"], undefined)).toBe(false);
  });

  it("normaliza aparatos y weekdays", () => {
    expect(normalizeClassApparatus([" vault ", "bars", "vault", ""])).toEqual(["vault", "bars"]);
    expect(normalizeClassApparatus([])).toBeNull();
    expect(normalizeClassApparatus(undefined)).toBeUndefined();
    expect(normalizeWeekdays([3, 1, 3, 0])).toEqual([0, 1, 3]);
    expect(normalizeWeekdays(undefined)).toBeNull();
  });

  it("resuelve horario final mezclando body y estado actual", () => {
    expect(
      resolveFinalSchedule({
        bodyWeekdays: [5, 2, 2],
        currentWeekdays: [1],
        bodyStartTime: undefined,
        bodyEndTime: "18:00",
        currentStartTime: "17:00",
        currentEndTime: "19:00",
      })
    ).toEqual({
      weekdays: [2, 5],
      startTime: "17:00",
      endTime: "18:00",
    });
  });
});

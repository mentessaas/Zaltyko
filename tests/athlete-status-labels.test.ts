import { describe, expect, it } from "vitest";

import {
  ATHLETE_STATUS_LABELS,
  athleteStatusOptions,
  getAthleteStatusLabel,
} from "@/lib/athletes/constants";

describe("athlete status labels", () => {
  it("exposes a human-readable label for every persisted status", () => {
    for (const status of athleteStatusOptions) {
      expect(ATHLETE_STATUS_LABELS[status]).toBeTruthy();
      expect(getAthleteStatusLabel(status)).not.toBe(status);
    }
  });
});

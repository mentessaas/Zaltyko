import { describe, expect, it } from "vitest";

import {
  getLocalCalendarDate,
  localDateToReceivedAt,
} from "@/modules/billing/domain/manual-payment-date";

describe("manual payment local date", () => {
  it("uses the current instant for today, even before local noon", () => {
    const morning = new Date(2026, 9, 13, 6, 15, 0);
    const selectedDate = getLocalCalendarDate(morning);

    expect(localDateToReceivedAt(selectedDate, morning)).toBe(
      morning.toISOString()
    );
  });

  it("keeps a selected past calendar date in local time", () => {
    const morning = new Date(2026, 9, 13, 6, 15, 0);
    const receivedAt = new Date(
      localDateToReceivedAt("2026-10-12", morning)
    );

    expect(receivedAt.getFullYear()).toBe(2026);
    expect(receivedAt.getMonth()).toBe(9);
    expect(receivedAt.getDate()).toBe(12);
    expect(receivedAt.getHours()).toBe(12);
  });
});

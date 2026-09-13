import { describe, expect, it } from "vitest";

import {
  RISKY_INVOICE_STATUSES,
  RISKY_SUBSCRIPTION_STATUSES,
  isRiskyBillingStatus,
} from "@/lib/super-admin-billing";

describe("super-admin Billing lifecycle vocabulary", () => {
  it("keeps invoice and subscription risk states separate", () => {
    expect(RISKY_INVOICE_STATUSES).toEqual(["open", "uncollectible"]);
    expect(RISKY_SUBSCRIPTION_STATUSES).toEqual(["past_due", "canceled", "unpaid"]);
    expect(isRiskyBillingStatus("open")).toBe(true);
    expect(isRiskyBillingStatus("uncollectible")).toBe(true);
    expect(isRiskyBillingStatus("past_due")).toBe(true);
    expect(isRiskyBillingStatus("paid")).toBe(false);
    expect(isRiskyBillingStatus("active")).toBe(false);
  });
});

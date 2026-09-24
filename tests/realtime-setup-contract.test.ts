import { describe, expect, it } from "vitest";
import { REQUIRED_REALTIME_TABLES } from "@/lib/supabase/verify-setup";

describe("Realtime setup contract", () => {
  it("covers every table consumed by client subscriptions", () => {
    expect(REQUIRED_REALTIME_TABLES).toEqual(
      expect.arrayContaining([
        "notifications",
        "profiles",
        "subscriptions",
        "academies",
        "classes",
        "billing_invoices",
        "contact_messages",
        "athletes",
        "coaches",
        "groups",
        "group_athletes",
        "class_sessions",
        "class_coach_assignments",
        "athlete_assessments",
        "audit_logs",
      ])
    );
  });
});

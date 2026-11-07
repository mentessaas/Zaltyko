import { describe, expect, it, vi } from "vitest";
import { isSaasTimestamp } from "@/components/owner-dashboard/owner-saas-timestamp";

describe("instantes SaaS, no decisión de vigencia", () => {
  it.each([
    "2026-10-22T07:00:00Z", "2026-10-22T09:00:00.000+02:00",
    "2026-10-22T03:30:00.123456-03:30", "2000-02-29T00:00:00Z",
    "2024-02-29T23:59:59.999Z", "1900-02-28T00:00:00Z",
    "0000-02-29T00:00:00Z", "9999-12-31T23:59:59Z",
    "2026-10-25T02:30:00+02:00", "2026-10-25T02:30:00+01:00",
  ])("acepta el instante explícito y válido %s", value => {
    expect(isSaasTimestamp(value)).toBe(true);
  });
  it.each([
    null, undefined, 0, {}, [], "", "2026-10-22", "2026-10-22T07:00:00",
    "Thu, 22 Oct 2026 07:00:00 GMT", "2026-02-29T00:00:00Z", "2026-02-30T00:00:00Z",
    "1900-02-29T00:00:00Z", "2100-02-29T00:00:00Z", "2026-04-31T00:00:00Z",
    "2026-00-01T00:00:00Z", "2026-13-01T00:00:00Z", "2026-01-00T00:00:00Z",
    "2026-10-22T24:00:00Z", "2026-10-22T07:60:00Z", "2026-10-22T07:00:60Z",
    "2026-10-22T07:00:00+24:00", "2026-10-22T07:00:00+02:60",
    " 2026-10-22T07:00:00Z", "2026-10-22T07:00:00Z ", "2026-10-22T07:00:00.Z",
    "2026-10-22T07:00:00Z\n",
  ])("rechaza valores ambiguos o fechas reparables por Date.parse %#", value => {
    expect(isSaasTimestamp(value)).toBe(false);
  });
  it("no consulta el reloj ni decide si un instante ya ha vencido", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("wall clock not allowed"); });
    try {
      expect(isSaasTimestamp("2001-01-01T00:00:00Z")).toBe(true);
      expect(isSaasTimestamp("2099-01-01T00:00:00Z")).toBe(true);
      expect(now).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
  });
});

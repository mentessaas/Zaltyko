import { describe, expect, it } from "vitest";
import { isDefinitiveAttendanceRejection } from "@/components/owner-dashboard/owner-attendance-command";

const denied = {
  type: "https://zaltyko.com/problems/location-scope-denied",
  title: "Acceso denegado",
  status: 403,
  detail: "El miembro no tiene acceso a esta sede",
};

describe("attendance denial versus lost response", () => {
  it.each(["location-scope-denied", "forbidden"])("recognizes a first authenticated %s rejection", (type) => {
    expect(isDefinitiveAttendanceRejection(403, { ...denied, type: `https://zaltyko.com/problems/${type}` }, false)).toBe(true);
  });

  it("retains the original uncertain command when a later attempt is denied", () => {
    expect(isDefinitiveAttendanceRejection(403, denied, true)).toBe(false);
  });

  it.each([null, {}, { ...denied, status: 400 }, { ...denied, type: "unknown" }, { ...denied, detail: "" }])("does not trust an invalid denial envelope %#", (payload) => {
    expect(isDefinitiveAttendanceRejection(403, payload, false)).toBe(false);
  });
});

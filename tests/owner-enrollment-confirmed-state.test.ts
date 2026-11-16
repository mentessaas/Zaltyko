import { describe, expect, it } from "vitest";
import {
  confirmedEnrollmentState,
  withConfirmedEnrollmentStates,
} from "@/components/owner-dashboard/owner-enrollment-confirmed-state";
import type { EnrollmentBundle } from "@/components/owner-dashboard/owner-enrollment-types";

const site = "10000000-0000-4000-8000-000000000002";
const enrollment: EnrollmentBundle["enrollments"][number] = {
  id: "10000000-0000-4000-8000-000000000004", athleteId: "10000000-0000-4000-8000-000000000005",
  givenName: "Ana", familyName: "Sintética", preferredName: null, athleteName: "Ana Sintética",
  status: "pending", startsOn: "2026-10-01", endsOn: null, version: 2,
  classTemplateId: "10000000-0000-4000-8000-000000000003", className: "Clase sintética",
  locationId: site, locationName: "Sede sintética", programName: null,
};
const bundle: EnrollmentBundle = {
  organization: { id: "10000000-0000-4000-8000-000000000001", name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "synthetic-member", role: "owner", locationScopeMode: "all" },
  locations: [{ id: site, name: "Sede sintética", timezone: "Europe/Madrid" }], programs: [], classes: [],
  enrollments: [enrollment], totalsByStatus: { pending: 1 }, total: 1, page: 1, pages: 1, pageSize: 50,
  selectedLocationId: site, filterLocationId: null, localTodayByLocation: { [site]: "2026-10-22" },
};
const activated = { id: enrollment.id, status: "active" as const, version: 3, endsOn: null };

describe("estado confirmado de inscripciones en el listado", () => {
  it("lee solo el acuse de la inscripción esperada", () => {
    const payload = { ok: true, data: { id: enrollment.id, status: "active", startsOn: "2026-10-01", endsOn: null, version: 3 } };
    expect(confirmedEnrollmentState(payload, enrollment.id)).toEqual(activated);
    expect(confirmedEnrollmentState(payload, "10000000-0000-4000-8000-000000000099")).toBeNull();
    expect(confirmedEnrollmentState({ ok: true, data: { ...payload.data, version: 0 } }, enrollment.id)).toBeNull();
    expect(confirmedEnrollmentState({ ok: true, data: { ...payload.data, status: "unknown" } }, enrollment.id)).toBeNull();
  });

  it("sin acuses conserva el mismo listado del servidor", () => {
    expect(withConfirmedEnrollmentStates(bundle, {}, "all")).toBe(bundle);
  });

  it("un listado anterior al acuse muestra el estado confirmado y mueve el total", () => {
    const view = withConfirmedEnrollmentStates(bundle, { [enrollment.id]: activated }, "all");
    expect(view.enrollments).toEqual([{ ...enrollment, status: "active", version: 3 }]);
    expect(view.totalsByStatus).toEqual({ pending: 0, active: 1 });
    expect(view.total).toBe(1);
  });

  it("con un filtro de estado retira la fila que ya no le corresponde", () => {
    const view = withConfirmedEnrollmentStates(bundle, { [enrollment.id]: activated }, "pending");
    expect(view.enrollments).toEqual([]);
    expect(view.total).toBe(0);
  });

  it("un listado con la misma versión o posterior manda", () => {
    const sameVersion = { ...bundle, enrollments: [{ ...enrollment, status: "active" as const, version: 3 }] };
    expect(withConfirmedEnrollmentStates(sameVersion, { [enrollment.id]: activated }, "all")).toBe(sameVersion);
    const newer = { ...bundle, enrollments: [{ ...enrollment, status: "paused" as const, version: 4 }] };
    expect(withConfirmedEnrollmentStates(newer, { [enrollment.id]: activated }, "pending")).toBe(newer);
  });
});

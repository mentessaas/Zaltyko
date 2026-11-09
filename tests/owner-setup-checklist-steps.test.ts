import { describe, expect, it } from "vitest";

import {
  buildOwnerSetupChecklist,
  canSeeOwnerSetupChecklist,
  type OwnerSetupProgress,
} from "@/modules/owner-dashboard/application/setup-checklist-steps";

const organizationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";

const empty: OwnerSetupProgress = {
  activeLocations: 0,
  hasScheduledClass: false,
  hasAthletes: false,
  hasEnrolledAthletes: false,
  hasAttendance: false,
};
const full: OwnerSetupProgress = {
  activeLocations: 1,
  hasScheduledClass: true,
  hasAthletes: true,
  hasEnrolledAthletes: true,
  hasAttendance: true,
};
const ownerAll = { organizationId, selectedLocationId: null, canManageOrganizationAthletes: true };

describe("buildOwnerSetupChecklist", () => {
  it("keeps the four steps in launch order", () => {
    const checklist = buildOwnerSetupChecklist(empty, ownerAll);
    expect(checklist.steps.map((step) => step.key)).toEqual(["location", "class", "athletes", "attendance"]);
    expect(checklist.total).toBe(4);
  });

  it("marks nothing done for an empty academy and highlights the first step", () => {
    const checklist = buildOwnerSetupChecklist(empty, ownerAll);
    expect(checklist.completed).toBe(0);
    expect(checklist.complete).toBe(false);
    expect(checklist.currentKey).toBe("location");
    expect(checklist.steps.every((step) => !step.done)).toBe(true);
    expect(checklist.steps.every((step) => step.detail)).toBe(true);
  });

  it("does not invent a link to create a site: no /owner screen does it after setup", () => {
    const location = buildOwnerSetupChecklist(empty, ownerAll).steps[0];
    expect(location.href).toBeNull();
    expect(location.action).toBeNull();
    expect(location.detail).toMatch(/soporte/);
  });

  it("partial progress: done steps lose their link and the next pending one is current", () => {
    const checklist = buildOwnerSetupChecklist(
      { ...empty, activeLocations: 2, hasScheduledClass: true },
      ownerAll
    );
    expect(checklist.completed).toBe(2);
    expect(checklist.currentKey).toBe("athletes");
    const [location, klass, athletes, attendance] = checklist.steps;
    expect(location).toMatchObject({ done: true, href: null, action: null, detail: null });
    expect(klass).toMatchObject({ done: true, href: null, action: null, detail: null });
    expect(athletes.done).toBe(false);
    expect(attendance).toMatchObject({
      done: false,
      href: `/owner/attendance?organizationId=${organizationId}`,
      action: "Pasar lista",
    });
  });

  it("each step is computed from its own data, not from the previous ones", () => {
    const checklist = buildOwnerSetupChecklist({ ...empty, activeLocations: 1, hasAttendance: true }, ownerAll);
    expect(checklist.steps.map((step) => step.done)).toEqual([true, false, false, true]);
    expect(checklist.currentKey).toBe("class");
  });

  it("is complete only when the four steps are done", () => {
    const checklist = buildOwnerSetupChecklist(full, ownerAll);
    expect(checklist).toMatchObject({ completed: 4, complete: true, currentKey: null });
    expect(checklist.steps.every((step) => step.href === null)).toBe(true);
    expect(buildOwnerSetupChecklist({ ...full, hasAttendance: false }, ownerAll).complete).toBe(false);
  });

  it("keeps the selected site in scoped links, like the Resumen navigation", () => {
    const checklist = buildOwnerSetupChecklist(
      { ...empty, activeLocations: 1, hasAthletes: true },
      { organizationId, selectedLocationId: locationId, canManageOrganizationAthletes: true }
    );
    const scope = `organizationId=${organizationId}&locationId=${locationId}`;
    const byKey = Object.fromEntries(checklist.steps.map((step) => [step.key, step]));
    expect(byKey.class.href).toBe(`/owner/classes?${scope}`);
    expect(byKey.athletes.href).toBe(`/owner/enrollments?${scope}`);
    expect(byKey.attendance.href).toBe(`/owner/attendance?${scope}`);
  });

  it("sends an organization-wide Owner/Admin without athletes to the intake screen", () => {
    const athletes = buildOwnerSetupChecklist({ ...empty, activeLocations: 1 }, ownerAll).steps[2];
    expect(athletes).toMatchObject({
      href: `/owner/athletes?organizationId=${organizationId}`,
      action: "Dar de alta",
    });
  });

  it("sends to enrollments once athletes exist but none is enrolled in a class", () => {
    const athletes = buildOwnerSetupChecklist(
      { ...empty, activeLocations: 1, hasAthletes: true },
      ownerAll
    ).steps[2];
    expect(athletes).toMatchObject({
      done: false,
      href: `/owner/enrollments?organizationId=${organizationId}`,
      action: "Inscribir",
    });
  });

  it("never links a role without organization-wide athlete access to the athletes screen", () => {
    const athletes = buildOwnerSetupChecklist(
      { ...empty, activeLocations: 1 },
      { organizationId, selectedLocationId: locationId, canManageOrganizationAthletes: false }
    ).steps[2];
    expect(athletes.href).toBe(`/owner/enrollments?organizationId=${organizationId}&locationId=${locationId}`);
  });
});

describe("canSeeOwnerSetupChecklist", () => {
  it("admits only the roles the owner surface resolves today", () => {
    expect(["owner", "admin", "manager"].map(canSeeOwnerSetupChecklist)).toEqual([true, true, true]);
    expect(["coach", "staff", "viewer", ""].map(canSeeOwnerSetupChecklist)).toEqual([false, false, false, false]);
  });
});

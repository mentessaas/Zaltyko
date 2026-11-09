/**
 * Pure step model for the "Puesta en marcha" checklist. Kept apart from the
 * query so the Resumen can build the steps without importing the database.
 */
export interface OwnerSetupProgress {
  activeLocations: number;
  hasScheduledClass: boolean;
  hasAthletes: boolean;
  hasEnrolledAthletes: boolean;
  hasAttendance: boolean;
}

export type OwnerSetupStepKey = "location" | "class" | "athletes" | "attendance";

export interface OwnerSetupStep {
  key: OwnerSetupStepKey;
  title: string;
  /** What the pending step asks for; null once done. */
  detail: string | null;
  done: boolean;
  /** Screen that resolves the pending step; null once done or if none exists. */
  href: string | null;
  action: string | null;
}

export interface OwnerSetupChecklist {
  steps: OwnerSetupStep[];
  completed: number;
  total: number;
  complete: boolean;
  /** First pending step, the one the panel highlights. */
  currentKey: OwnerSetupStepKey | null;
}

/** Same roles that `resolveOwnerScope` admits today. */
const ownerSetupChecklistRoles = new Set(["owner", "admin", "manager"]);

export function canSeeOwnerSetupChecklist(role: string): boolean {
  return ownerSetupChecklistRoles.has(role);
}

export function buildOwnerSetupChecklist(
  progress: OwnerSetupProgress,
  context: {
    organizationId: string;
    selectedLocationId: string | null;
    canManageOrganizationAthletes: boolean;
  }
): OwnerSetupChecklist {
  const params = new URLSearchParams({ organizationId: context.organizationId });
  if (context.selectedLocationId) params.set("locationId", context.selectedLocationId);
  const scoped = (path: string) => `${path}?${params}`;

  const locationDone = progress.activeLocations > 0;
  const athletesLinkToIntake =
    context.canManageOrganizationAthletes && !progress.hasAthletes;

  const steps: OwnerSetupStep[] = [
    {
      key: "location",
      title: "Crea una sede",
      done: locationDone,
      detail: locationDone
        ? null
        : "La sede reúne clases, horarios y listas. La primera se crea al configurar la academia; si no aparece activa, escribe al soporte de Zaltyko.",
      // No /owner screen creates sites after setup, so there is nothing to link.
      href: null,
      action: null,
    },
    {
      key: "class",
      title: "Crea una clase con horario",
      done: progress.hasScheduledClass,
      detail: progress.hasScheduledClass
        ? null
        : "Define la clase, su capacidad y los días y horas de entrenamiento.",
      href: progress.hasScheduledClass ? null : scoped("/owner/classes"),
      action: progress.hasScheduledClass ? null : "Crear clase",
    },
    {
      key: "athletes",
      title: "Da de alta a tus gimnastas",
      done: progress.hasEnrolledAthletes,
      detail: progress.hasEnrolledAthletes
        ? null
        : athletesLinkToIntake
          ? "Crea sus fichas y después inscríbelas en una clase para que aparezcan en la lista."
          : "Inscribe gimnastas en una clase: la lista de asistencia se forma con sus inscripciones.",
      href: progress.hasEnrolledAthletes
        ? null
        : athletesLinkToIntake
          ? `/owner/athletes?${new URLSearchParams({ organizationId: context.organizationId })}`
          : scoped("/owner/enrollments"),
      action: progress.hasEnrolledAthletes
        ? null
        : athletesLinkToIntake
          ? "Dar de alta"
          : "Inscribir",
    },
    {
      key: "attendance",
      title: "Pasa la primera lista",
      done: progress.hasAttendance,
      detail: progress.hasAttendance
        ? null
        : "Marca quién ha venido a una sesión de la clase.",
      href: progress.hasAttendance ? null : scoped("/owner/attendance"),
      action: progress.hasAttendance ? null : "Pasar lista",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    complete: completed === steps.length,
    currentKey: steps.find((step) => !step.done)?.key ?? null,
  };
}

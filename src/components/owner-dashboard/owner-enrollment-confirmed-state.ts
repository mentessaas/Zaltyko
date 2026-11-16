import type { EnrollmentBundle, StatusFilter } from "./owner-enrollment-types";

type Enrollment = EnrollmentBundle["enrollments"][number];

export type ConfirmedEnrollmentState = Pick<Enrollment, "id" | "status" | "version" | "endsOn">;

const enrollmentStatuses: readonly string[] = ["pending", "trial", "active", "paused", "cancelled", "completed"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Estado que el servidor confirmó en el acuse de un cambio de inscripción. */
export function confirmedEnrollmentState(payload: unknown, expectedId: string): ConfirmedEnrollmentState | null {
  if (!record(payload) || payload.ok !== true || !record(payload.data)) return null;
  const { id, status, version, endsOn } = payload.data;
  if (typeof id !== "string" || id !== expectedId || typeof status !== "string" || !enrollmentStatuses.includes(status) ||
      typeof version !== "number" || !Number.isSafeInteger(version) || version <= 0 ||
      !(endsOn === null || typeof endsOn === "string")) return null;
  return { id, status: status as Enrollment["status"], version, endsOn };
}

/**
 * Aplica al listado los acuses confirmados en esta página mientras
 * router.refresh() trae el servidor. Una respuesta del listado con una versión
 * igual o posterior manda; una anterior (refresco lento o desordenado) no puede
 * devolver la fila a un estado ya superado.
 */
export function withConfirmedEnrollmentStates(
  bundle: EnrollmentBundle,
  confirmed: Readonly<Record<string, ConfirmedEnrollmentState>>,
  selectedStatus: StatusFilter
): EnrollmentBundle {
  let changed = false;
  let hidden = 0;
  const totalsByStatus = { ...bundle.totalsByStatus };
  const enrollments = bundle.enrollments.flatMap((enrollment) => {
    const state = confirmed[enrollment.id];
    if (!state || state.version <= enrollment.version) return [enrollment];
    changed = true;
    if (state.status !== enrollment.status) {
      totalsByStatus[enrollment.status] = Math.max(0, (totalsByStatus[enrollment.status] ?? 0) - 1);
      totalsByStatus[state.status] = (totalsByStatus[state.status] ?? 0) + 1;
    }
    // Ya no pertenece al filtro abierto: el listado del servidor tampoco la incluiría.
    if (selectedStatus !== "all" && state.status !== selectedStatus) {
      hidden += 1;
      return [];
    }
    return [{ ...enrollment, status: state.status, version: state.version, endsOn: state.endsOn }];
  });
  if (!changed) return bundle;
  return { ...bundle, enrollments, totalsByStatus, total: Math.max(0, bundle.total - hidden) };
}

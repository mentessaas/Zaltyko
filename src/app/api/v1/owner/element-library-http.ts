import { NextResponse } from "next/server";

import { problemResponse } from "@/app/api/v1/problem";

import {
  apiSuccess,
  invalidInput,
  noStore,
  progressError,
  resolveSkillActor,
  sameOriginProblem,
} from "./skill-levels-http";

/**
 * Piezas comunes de las rutas de la biblioteca de elementos. Mismo orden que
 * niveles y progresión: sesión (401), mismo origen en la nota (403),
 * validación estricta (400), alcance del equipo técnico con la sede pedida
 * (403/404), límite de peticiones (429) y, por último, el servicio, que vuelve
 * a comprobar banderas, tablas, rol, sede y plan dentro de su transacción. Las
 * familias no son equipo: el alcance las deja fuera.
 */
export { apiSuccess, invalidInput, noStore, progressError, sameOriginProblem };

/** Alcance del actor: el mismo del equipo técnico que niveles y progresión. */
export const resolveLibraryActor = resolveSkillActor;

export function libraryUnauthenticated(): NextResponse {
  return noStore(
    problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para ver la biblioteca de elementos.",
      type: "authentication-required",
    })
  );
}

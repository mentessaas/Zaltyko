import { NextResponse } from "next/server";

import { problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import type { WriteResult } from "@/modules/skill-levels/domain/skill-levels";

import {
  invalidInput,
  noStore,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
} from "./athlete-progress-http";

/**
 * Piezas comunes de las rutas de niveles y progresión. El orden de las
 * comprobaciones es el de las rutas de objetivos y observaciones: sesión
 * (401), mismo origen en mutaciones (403), validación (400), alcance de la
 * academia y la sede (403/404), límite de peticiones (429) y, por último, el
 * servicio, que vuelve a autorizar rol, sede, gimnasta, bandera y plan dentro
 * de su transacción. La superficie operativa del equipo (dirección,
 * administración, coordinación y entrenadores de su sede) se resuelve en
 * resolveProgressActor; aquí no se vuelve a pedir.
 */
export { invalidInput, noStore, progressError, sameOriginProblem };

/** Alcance del actor: reutiliza la resolución del equipo técnico de las rutas de objetivos. */
export const resolveSkillActor = resolveProgressActor;

export function skillUnauthenticated(): NextResponse {
  return noStore(
    problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para ver los niveles y la progresión.",
      type: "authentication-required",
    })
  );
}

export function skillWriteResponse<T extends WriteResult>(result: T): NextResponse {
  return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
}

export { apiSuccess };

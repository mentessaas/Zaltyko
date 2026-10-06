import { NextResponse } from "next/server";

import { OperationalError } from "@/modules/shared/domain/operational-error";

export function problemResponse(input: {
  status: number;
  title: string;
  detail: string;
  type: string;
  errors?: unknown;
}) {
  return NextResponse.json(
    {
      type: `https://zaltyko.com/problems/${input.type}`,
      title: input.title,
      status: input.status,
      detail: input.detail,
      ...(input.errors ? { errors: input.errors } : {}),
    },
    {
      status: input.status,
      headers: {
        "content-type": "application/problem+json",
        "cache-control": "private, no-store",
      },
    }
  );
}

export function operationalProblem(error: OperationalError) {
  return problemResponse({
    status: error.status,
    title:
      error.status === 403
        ? "Acceso denegado"
        : error.status === 404
          ? "Recurso no encontrado"
          : error.status === 409
            ? "Conflicto de versión o estado"
            : "Solicitud no procesable",
    detail: error.message,
    type: error.code.toLowerCase().replaceAll("_", "-"),
  });
}

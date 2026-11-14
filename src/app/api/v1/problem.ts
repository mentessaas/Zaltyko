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

function operationalTitle(error: OperationalError): string {
  // A rolled-back attempt the client should simply repeat (for example a
  // deadlock PostgreSQL broke): say so instead of a generic failure.
  if (error.code === "CONCURRENCY_RETRY") {
    return "Operación ocupada, vuelve a intentarlo";
  }
  return error.status === 403
    ? "Acceso denegado"
    : error.status === 404
      ? "No lo encontramos"
      : error.status === 409
        ? "Conflicto de versión o estado"
        : "Solicitud no procesable";
}

export function operationalProblem(error: OperationalError) {
  return problemResponse({
    status: error.status,
    title: operationalTitle(error),
    detail: error.message,
    type: error.code.toLowerCase().replaceAll("_", "-"),
    errors: error.details,
  });
}

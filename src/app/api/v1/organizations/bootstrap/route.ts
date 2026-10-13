import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  bootstrapOrganization,
  bootstrapOrganizationRequestSchema,
} from "@/modules/organizations/application/bootstrap-organization";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = bootstrapOrganizationRequestSchema;

// @auth-flexible route-guard-reason: verified auth user is resolved before parsing; bootstrap binds ownership to that user inside one transaction.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para crear una organización.",
      type: "authentication-required",
    });
  }
  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse({
    ...(payload && typeof payload === "object" ? payload : {}),
    idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Configuración inválida",
      detail: "Revisa el nombre de la academia, la sede y las actividades.",
      type: "invalid-organization-bootstrap",
      errors: parsed.error.flatten(),
    });
  }
  try {
    const result = await bootstrapOrganization({
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

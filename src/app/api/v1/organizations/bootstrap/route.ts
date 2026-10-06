import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { bootstrapOrganization } from "@/modules/organizations/application/bootstrap-organization";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180).optional(),
  countryCode: z.string().trim().length(2).default("ES"),
  timezone: z.string().trim().min(3).max(80).default("Europe/Madrid"),
  locationName: z.string().trim().min(2).max(120),
  locationCode: z.string().trim().min(2).max(32),
  idempotencyKey: z.string().trim().min(8).max(150),
});

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
      detail: "Revisa academia, sede, país y zona horaria.",
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

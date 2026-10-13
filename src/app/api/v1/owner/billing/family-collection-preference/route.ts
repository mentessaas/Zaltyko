import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getFamilyCollectionPreference,
  saveFamilyCollectionPreference,
} from "@/modules/billing/application/family-collection-preferences";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({
  organizationId: z.string().uuid(),
  familyId: z.string().uuid(),
});

const bodySchema = querySchema
  .extend({
    mode: z.enum(["manual", "automatic"]),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para consultar la preferencia de cobro.",
    type: "authentication-required",
  });
}

// @auth-flexible route-guard-reason: billing service resolves the active organization member, owner/admin role, full-organization location scope, and charge visibility before accessing a family preference.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    organizationId: params.get("organizationId"),
    familyId: params.get("familyId"),
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Familia o academia inválida",
      detail: "Selecciona una familia con cargos pendientes.",
      type: "invalid-family-collection-preference",
    });
  }

  try {
    const preference = await getFamilyCollectionPreference({
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json(preference, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: validates a fresh human session, derives the member server-side, and persists only a family preference with paid-entitlement validation, CAS, audit, and outbox.
export async function PUT(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (
    !parsed.success ||
    idempotencyKey.trim().length < 8 ||
    idempotencyKey.trim().length > 150
  ) {
    return problemResponse({
      status: 400,
      title: "Preferencia incompleta",
      detail: "Indica la modalidad de esta familia y vuelve a cargar si cambió la versión.",
      type: "invalid-family-collection-preference",
      errors: {
        ...(parsed.success ? {} : { body: parsed.error.flatten() }),
        ...(idempotencyKey.trim().length >= 8 &&
        idempotencyKey.trim().length <= 150
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
      },
    });
  }

  try {
    const preference = await saveFamilyCollectionPreference({
      ...parsed.data,
      userId: user.id,
      idempotencyKey: idempotencyKey.trim(),
    });
    return NextResponse.json(preference, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

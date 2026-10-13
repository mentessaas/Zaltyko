import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getOwnerDashboardLayout,
  saveOwnerDashboardLayout,
} from "@/modules/owner-dashboard/application/dashboard-layout";
import { ownerDashboardModuleOrderSchema } from "@/modules/owner-dashboard/domain/dashboard-layout";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationIdSchema = z.string().uuid();
const saveBodySchema = z.object({
  organizationId: z.string().uuid(),
  order: ownerDashboardModuleOrderSchema,
  expectedVersion: z.number().int().min(0),
});

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para guardar la organización y el panel.",
    type: "authentication-required",
  });
}

// @auth-flexible route-guard-reason: requires a session and resolves owner-surface membership before reading or saving a user-scoped layout.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const parsed = organizationIdSchema.safeParse(organizationId);
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Organización inválida",
      detail: "Selecciona una academia para cargar tu panel.",
      type: "invalid-organization",
    });
  }

  try {
    const layout = await getOwnerDashboardLayout({
      userId: user.id,
      organizationId: parsed.data,
    });
    return NextResponse.json(layout, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: verifies session, tenant membership, and owner-surface role in the application service.
export async function PUT(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const body = await request.json().catch(() => null);
  const parsed = saveBodySchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Orden del panel inválido",
      detail: "Los módulos del panel deben aparecer una sola vez.",
      type: "invalid-dashboard-layout",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const layout = await saveOwnerDashboardLayout({
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json(layout, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

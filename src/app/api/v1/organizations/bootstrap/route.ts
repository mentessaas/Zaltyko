import type { User as SupabaseUser } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { findLegacyAcademyMemberships } from "@/lib/auth/legacy-academy-access";
import { createClient } from "@/lib/supabase/server";
import {
  OwnerSignupConsentError,
  recordOwnerSignupConsent,
} from "@/modules/organizations/application/owner-signup-consent";
import {
  bootstrapOrganization,
  bootstrapOrganizationRequestSchema,
} from "@/modules/organizations/application/bootstrap-organization";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = bootstrapOrganizationRequestSchema;
const contractualAcceptanceSchema = z
  .object({
    accepted: z.literal(true),
    policyVersion: z.string().min(1).max(64),
  })
  .strict();

// @auth-flexible route-guard-reason: the verified session is resolved before parsing; a second auth.getUser read supplies signup metadata and must match the same subject before the consent gate or bootstrap.
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
  let authUser: SupabaseUser | null;
  try {
    const supabase = await createClient(await cookies());
    const result = await supabase.auth.getUser();
    authUser = result.data.user;
    if (result.error || !authUser || authUser.id !== user.id) {
      return problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Debes iniciar sesión para crear una organización.",
        type: "authentication-required",
      });
    }
  } catch {
    return problemResponse({
      status: 503,
      title: "No se pudo verificar la sesión",
      detail: "Inténtalo de nuevo más tarde.",
      type: "authentication-verification-unavailable",
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
  const acceptanceValue =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).contractualAcceptance
      : undefined;
  let contractualAcceptance:
    { accepted: true; policyVersion: string } | undefined;
  if (acceptanceValue !== undefined) {
    const acceptance = contractualAcceptanceSchema.safeParse(acceptanceValue);
    if (!acceptance.success) {
      return problemResponse({
        status: 400,
        title: "Aceptación no válida",
        detail: "Revisa la aceptación de los términos vigentes.",
        type: "invalid-contractual-acceptance",
      });
    }
    contractualAcceptance = acceptance.data;
  }

  // Esta lectura legacy se hace antes del consentimiento y del bootstrap.
  // Una cuenta con academia existente necesita una vinculación revisada; no
  // debe crear una organización canónica paralela.
  const legacyMemberships = await findLegacyAcademyMemberships(user.id);
  if (legacyMemberships.length > 0) {
    return problemResponse({
      status: 409,
      title: "La cuenta ya pertenece a una academia",
      detail:
        "Solicita la vinculación o revisión de tu academia existente. No se creará otra organización para esta cuenta.",
      type: "legacy-academy-link-required",
    });
  }

  try {
    await recordOwnerSignupConsent(authUser, {
      requestKey: parsed.data.idempotencyKey,
      contractualAcceptance,
    });
    const result = await bootstrapOrganization({
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof OwnerSignupConsentError) {
      if (error.code === "CONSENT_STORE_UNAVAILABLE") {
        return problemResponse({
          status: 503,
          title: "No se pudo verificar el consentimiento",
          detail: "Inténtalo de nuevo más tarde.",
          type: "consent-verification-unavailable",
        });
      }
      const rejected = error.code === "CONSENT_REJECTED";
      return problemResponse({
        status: rejected ? 403 : 428,
        title: rejected
          ? "Consentimiento no válido"
          : "Consentimiento requerido",
        detail: rejected
          ? "Vuelve a iniciar el registro y acepta los términos vigentes."
          : "Acepta los términos vigentes para crear la organización.",
        type: rejected ? "consent-rejected" : "consent-required",
      });
    }
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

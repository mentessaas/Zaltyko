import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { apiCreated, apiError } from "@/lib/api-response";
import { claimAcademy, ClaimAcademyBodySchema } from "@/lib/onboarding/owner-claim";
import { withTransaction } from "@/lib/db-transactions";
import { logEvent } from "@/lib/event-logging";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(
      "UNAUTHENTICATED",
      "Debes iniciar sesión para reclamar la academia.",
      401
    );
  }

  if (!user.email) {
    return apiError(
      "EMAIL_REQUIRED",
      "Tu cuenta no tiene un email asociado. Contacta a soporte para reclamar la academia.",
      400
    );
  }

  // Capturamos el email ya validado para evitar el narrowing incompleto
  // dentro del callback async de withTransaction.
  const userEmail = user.email;

  const parsed = ClaimAcademyBodySchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return apiError(
      "INVALID_PAYLOAD",
      "Datos inválidos para reclamar la academia",
      400
    );
  }

  // Serialize per-user claims: dos requests concurrentes del mismo usuario
  // no deben terminar creando perfiles duplicados ni reasignando ownerId
  // dos veces. El caller (page.tsx) ya filtra por email, así que el riesgo
  // real son dos pestañas que disparan el POST a la vez.
  const result = await withTransaction(async (tx) =>
    claimAcademy(
      {
        userId: user.id,
        userEmail,
        body: parsed.data,
      },
      tx
    )
  );

  if (!result.ok) {
    return result.response;
  }

  await logEvent({
    academyId: result.academyId,
    eventType: "owner_claimed",
    metadata: {
      source: "magic_link_match",
      // ZAL-157 — los UTMs llegan del cliente en el body; el helper ya los
      // persiste en la academia. Los reenviamos al log para que el funnel
      // post-signup tenga el canal sin tener que re-leer la academia.
      utm: parsed.data.utm ?? null,
    },
  });

  return apiCreated({
    academyId: result.academyId,
    tenantId: result.tenantId,
    redirectUrl: result.redirectUrl,
  });
}

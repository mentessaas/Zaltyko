// Auto-eliminación de cuenta del usuario actual (Apple Guideline 5.1.1
// y Google Play data-deletion requirement).
//
// Solo accesible vía Bearer token (cliente móvil). El web ya tiene
// su flujo de "Eliminar cuenta" en Settings y no necesita este endpoint.
//
// Lo que hace:
//   1. Verifica Bearer JWT con el cliente Supabase de servicio.
//   2. Exige confirmación explícita en el body (frase literal) para
//      evitar borrados accidentales.
//   3. Borra tokens push del usuario (no se hace cascade automático).
//   4. Borra el usuario de auth.users (las filas en `profiles` se
//      eliminan por FK CASCADE definida en la migración inicial).
//
// Lo que NO hace (fuera de scope MVP):
//   - Anonimización de datos históricos (asistencia, pagos). Se
//     conservan por integridad financiera / legal; un job nocturno
//     puede purgar filas huérfanas si se requiere.
//   - Notificación por email previa al borrado. Se puede añadir
//     con `src/lib/notifications/email-service.ts`.

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { apiSuccess, apiError } from '@/lib/api-response';
import { withErrorHandler } from '@/lib/api-error-handler';
import { db } from '@/db';
import { pushTokens } from '@/db/schema/push-tokens';
import { createBearerSupabaseClient, getBearerToken } from '@/lib/supabase/bearer-client';
import { deleteAuthUser } from '@/lib/supabase/admin-operations';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DeleteAccountSchema = z.object({
  confirm: z.literal('ELIMINAR MI CUENTA'),
});

export const POST = withErrorHandler(async (request: Request) => {
  const token = getBearerToken(request);
  if (!token) {
    return apiError('UNAUTHENTICATED', 'Bearer token required', 401);
  }

  let parsed;
  try {
    parsed = DeleteAccountSchema.parse(await request.json());
  } catch {
    return apiError(
      'CONFIRMATION_REQUIRED',
      'Debes confirmar el borrado enviando { confirm: "ELIMINAR MI CUENTA" }',
      400
    );
  }
  // `parsed` solo se usa para forzar el tipado via Zod.
  void parsed;

  const supabase = createBearerSupabaseClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return apiError('UNAUTHENTICATED', 'Sesión inválida o expirada', 401);
  }
  const userId = userData.user.id;

  // 1. Limpiar push tokens del usuario (best-effort; si falla, el
  //    borrado de auth.user sigue siendo la fuente de verdad).
  try {
    await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
  } catch (err) {
    logger.warn('[delete-account] no se pudieron purgar push tokens', {
      userId,
      err,
    });
  }

  // 2. Borrar el usuario de auth. Cascade elimina `profiles` y resto
  //    de filas que referencian auth.users.id con ON DELETE CASCADE.
  try {
    await deleteAuthUser(userId);
  } catch (err) {
    logger.error('[delete-account] deleteAuthUser falló', { userId, err });
    return apiError(
      'INTERNAL_ERROR',
      'No se pudo eliminar la cuenta. Inténtalo de nuevo o contacta con soporte.',
      500
    );
  }

  return apiSuccess({ ok: true });
});
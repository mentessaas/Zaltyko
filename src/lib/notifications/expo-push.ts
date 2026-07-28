/**
 * Expo Push sender (iOS + Android nativos).
 *
 * Expo Push API: https://exp.host/--/api/v2/push/send
 * - Gratis hasta 600 msg/s/proyecto, suficiente para Zaltyko MVP.
 * - No requiere auth key para el free tier; si crece, EXPO_ACCESS_TOKEN
 *   se puede añadir al header para mejorar rate limit.
 * - Tokens Expo tienen forma `ExponentPushToken[...]`. La tabla
 *   `push_tokens` no distingue provider: detectamos por prefijo para
 *   evitar una migración.
 *
 * Manejo de errores:
 * - `DeviceNotRegistered` → marcar `is_active=false` (no borrar; el
 *   usuario puede reinstalar la app y re-registrar el mismo token).
 * - Resto de errores → log y contar como failed.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { pushTokens } from "@/db/schema/push-tokens";
import { logger } from "@/lib/logger";

export interface ExpoPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?:
      | "DeviceNotRegistered"
      | "InvalidCredentials"
      | "MessageTooBig"
      | "MessageRateExceeded"
      | string;
  };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo recomienda batches de hasta 100 mensajes por request.
const EXPO_BATCH_SIZE = 100;

function isExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[");
}

/**
 * Envía push a todos los dispositivos nativos (iOS + Android) de un
 * usuario leyendo de `push_tokens`. Tokens web (VAPID) los ignora —
 * los gestiona `push-service.ts` por separado.
 */
export async function sendExpoPushToUser(
  userId: string,
  payload: ExpoPushPayload
): Promise<{ sent: number; failed: number }> {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(
      and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true))
    );

  const expoTokens = rows.map((r) => r.token).filter(isExpoToken);
  if (expoTokens.length === 0) return { sent: 0, failed: 0 };

  return sendExpoPushBatch(expoTokens, payload, userId);
}

async function sendExpoPushBatch(
  tokens: string[],
  payload: ExpoPushPayload,
  userId: string
): Promise<{ sent: number; failed: number }> {
  const messages = tokens.map((to) => ({
    to,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
  }));

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error(
          `[expo-push] HTTP ${res.status} user=${userId} count=${batch.length} body=${text.slice(0, 200)}`
        );
        failed += batch.length;
        continue;
      }

      const tickets = (await res.json()) as ExpoPushTicket[];
      // Los tickets vienen en el mismo orden que los mensajes enviados.
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        const expoToken = batch[j]?.to;
        if (ticket?.status === "ok") {
          sent++;
          continue;
        }
        failed++;
        const reason = ticket?.details?.error;
        if (reason === "DeviceNotRegistered" && expoToken) {
          await db
            .update(pushTokens)
            .set({ isActive: false })
            .where(
              and(
                eq(pushTokens.userId, userId),
                eq(pushTokens.token, expoToken)
              )
            )
            .catch((err) =>
              logger.warn(
                `[expo-push] failed to deactivate token user=${userId}: ${String(err)}`
              )
            );
        } else if (reason) {
          logger.warn(
            `[expo-push] ticket error user=${userId} reason=${reason} message=${ticket?.message ?? ""}`
          );
        }
      }
    } catch (err) {
      logger.error(
        `[expo-push] fetch failed user=${userId} count=${batch.length}: ${String(err)}`
      );
      failed += batch.length;
    }
  }

  return { sent, failed };
}

/**
 * Feature flag. Por defecto activado para MVP. Para apagar temporalmente
 * (debugging, rate limits, etc.) basta con `EXPO_PUSH_ENABLED=false` en
 * el env. El Web Push sigue funcionando porque es independiente.
 */
export function isExpoPushConfigured(): boolean {
  return process.env.EXPO_PUSH_ENABLED !== "false";
}
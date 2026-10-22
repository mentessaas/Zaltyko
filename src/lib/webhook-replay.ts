import { kv } from "@vercel/kv";
import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";

export type ReplayClaim = "claimed" | "duplicate" | "unavailable";

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Claims a provider delivery id/token exactly once. The claim is intentionally
 * made only after signature verification, so attacker-controlled input never
 * consumes the replay budget. In production, missing KV fails closed.
 */
export async function claimWebhookReplay(
  namespace: string,
  value: string,
  ttlSeconds: number
): Promise<ReplayClaim> {
  if (!isKvConfigured()) {
    if (process.env.NODE_ENV === "production") {
      logger.error("Webhook replay protection is not configured");
      return "unavailable";
    }
    // Local contract tests do not need an external state store.
    return "claimed";
  }

  const digest = createHash("sha256").update(value, "utf8").digest("hex");
  const key = `webhook_replay:${namespace}:${digest}`;

  try {
    const result = await kv.set(key, "1", { nx: true, ex: ttlSeconds });
    return result === "OK" ? "claimed" : "duplicate";
  } catch (error) {
    logger.error("Webhook replay claim failed", error, { namespace });
    return "unavailable";
  }
}

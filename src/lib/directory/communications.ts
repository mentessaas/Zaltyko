import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rows, DirectoryError, listEntries } from "./service";
import { flag, entryPath } from "./contracts";
import { sendEmail } from "@/lib/brevo";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { escapeHtml } from "@/lib/email/escape-html";
export const consentVersion = "directory-2026-09-30";
export const SubscriptionSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    purpose: z.enum([
      "calendar",
      "favorite_changes",
      "marketing",
      "kit",
      "claim_updates",
    ]),
    consent: z.literal(true),
    version: z.literal(consentVersion),
    source: z.enum(["directory", "kit", "my-listings"]),
    filters: z
      .object({
        country: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional(),
        city: z.string().max(120).optional(),
        discipline: z.string().max(40).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
function secret() {
  const value = process.env.DIRECTORY_TOKEN_SECRET;
  if (!value || value.length < 32)
    throw new DirectoryError(
      "COMMUNICATIONS_UNAVAILABLE",
      "Los avisos todavía no están configurados",
      503
    );
  return value;
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function confirmationToken(id: string, expires: string) {
  return signature(`confirm:${id}:${expires}`);
}
export function unsubscribeToken(id: string) {
  return signature(`unsubscribe:${id}`);
}
export function validToken(actual: string, expected: string) {
  return (
    /^[a-f0-9]{64}$/.test(actual) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))
  );
}
export async function requestSubscription(
  input: unknown,
  userId: string | null
) {
  if (!flag("communications"))
    throw new DirectoryError(
      "COMMUNICATIONS_DISABLED",
      "Los avisos todavía no están activos",
      503
    );
  secret();
  const data = SubscriptionSchema.parse(input);
  if (["favorite_changes", "claim_updates"].includes(data.purpose) && !userId)
    throw new DirectoryError(
      "AUTH_REQUIRED",
      "Inicia sesión para recibir cambios de favoritos",
      401
    );
  const id = randomUUID(),
    expires = new Date(Date.now() + 48 * 3600000).toISOString(),
    token = confirmationToken(id, expires);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory-consent:${data.email}:${data.purpose}`}))`
    );
    await tx.execute(
      sql`UPDATE directory_subscriptions SET withdrawn_at=now() WHERE lower(email)=${data.email} AND purpose=${data.purpose} AND filters=${JSON.stringify(data.filters)}::jsonb AND confirmed_at IS NULL AND withdrawn_at IS NULL AND token_expires_at<now()`
    );
    const result = (
      await tx.execute(
        sql`INSERT INTO directory_subscriptions(id,user_id,email,purpose,filters,policy_version,source,token_hash,token_expires_at) VALUES(${id}::uuid,${userId}::uuid,${data.email},${data.purpose},${JSON.stringify(data.filters)}::jsonb,${data.version},${data.source},${digest(token)},${expires}::timestamptz) ON CONFLICT DO NOTHING RETURNING id`
      )
    ).rows;
    if (result.length)
      await tx.execute(
        sql`INSERT INTO directory_deliveries(subscription_id,dedupe_key) VALUES(${id}::uuid,${`confirm:${id}`}) ON CONFLICT DO NOTHING`
      );
  });
  return {
    message:
      "Si procede, recibirás un enlace para confirmar esta solicitud. No se te ha suscrito a otras comunicaciones.",
  };
}
export async function confirmSubscription(id: string, token: string) {
  if (!flag("communications"))
    throw new DirectoryError(
      "COMMUNICATIONS_DISABLED",
      "Los avisos están desactivados",
      503
    );
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(
        sql`SELECT * FROM directory_subscriptions WHERE id=${id}::uuid FOR UPDATE`
      )
    ).rows[0];
    if (
      !row ||
      row.withdrawn_at ||
      !validToken(digest(token), String(row.token_hash)) ||
      new Date(String(row.token_expires_at)).getTime() < Date.now()
    )
      throw new DirectoryError(
        "INVALID_TOKEN",
        "Enlace caducado o no válido",
        400
      );
    await tx.execute(
      sql`UPDATE directory_subscriptions SET confirmed_at=COALESCE(confirmed_at,now()) WHERE id=${id}::uuid`
    );
    if (row.purpose === "kit")
      await tx.execute(
        sql`INSERT INTO directory_deliveries(subscription_id,dedupe_key) VALUES(${id}::uuid,${`kit:${id}`}) ON CONFLICT DO NOTHING`
      );
    return { confirmed: true, purpose: row.purpose };
  });
}
export async function withdrawSubscription(id: string, token: string) {
  if (!validToken(token, unsubscribeToken(id)))
    throw new DirectoryError("INVALID_TOKEN", "Enlace no válido");
  await rows(
    sql`UPDATE directory_subscriptions SET withdrawn_at=COALESCE(withdrawn_at,now()) WHERE id=${id}::uuid`
  );
  return { withdrawn: true };
}
export async function hasPositiveMarketingConsent(email: string) {
  if (!flag("communications")) return false;
  const result = await rows(
    sql`SELECT 1 FROM directory_subscriptions WHERE lower(email)=lower(${email}) AND purpose='marketing' AND confirmed_at IS NOT NULL AND withdrawn_at IS NULL AND bounce_at IS NULL AND complaint_at IS NULL LIMIT 1`
  );
  return result.length > 0;
}
export async function enqueueDigests(now = new Date()) {
  const day = now.toISOString().slice(0, 10),
    monday = now.getUTCDay() === 1;
  const subscriptions = await rows(
    sql`SELECT id,purpose FROM directory_subscriptions WHERE confirmed_at IS NOT NULL AND withdrawn_at IS NULL AND bounce_at IS NULL AND complaint_at IS NULL AND (purpose='favorite_changes' OR (purpose='calendar' AND ${monday})) AND NOT EXISTS(SELECT 1 FROM directory_deliveries d WHERE d.subscription_id=directory_subscriptions.id AND d.dedupe_key=directory_subscriptions.purpose||':'||directory_subscriptions.id::text||':'||${day}) ORDER BY created_at LIMIT 500`
  );
  for (const sub of subscriptions)
    await rows(
      sql`INSERT INTO directory_deliveries(subscription_id,dedupe_key) VALUES(${sub.id}::uuid,${`${sub.purpose}:${sub.id}:${day}`}) ON CONFLICT DO NOTHING`
    );
  const claims =
    await rows(sql`INSERT INTO directory_deliveries(subscription_id,dedupe_key)
 SELECT s.id,'claim:'||c.id::text||':'||c.status FROM directory_subscriptions s JOIN directory_claims c ON c.user_id=s.user_id WHERE s.purpose='claim_updates' AND s.confirmed_at IS NOT NULL AND s.withdrawn_at IS NULL AND s.bounce_at IS NULL AND s.complaint_at IS NULL AND NOT EXISTS(SELECT 1 FROM directory_deliveries d WHERE d.dedupe_key='claim:'||c.id::text||':'||c.status AND d.subscription_id=s.id) ORDER BY c.created_at LIMIT 500 ON CONFLICT DO NOTHING RETURNING id`);
  return { queued: subscriptions.length + claims.length };
}
export async function processDeliveries(deliver: typeof sendEmail = sendEmail) {
  if (!flag("communications")) return { sent: 0 };
  secret();
  if (
    deliver === sendEmail &&
    (!process.env.BREVO_API_KEY || !process.env.BREVO_REPLY_TO)
  )
    throw new DirectoryError(
      "EMAIL_NOT_CONFIGURED",
      "Falta configurar el proveedor de correo",
      503
    );
  let sent = 0;
  for (let i = 0; i < 30; i++) {
    const delivery = await db.transaction(async (tx) => {
      const row = (
        await tx.execute(
          sql`SELECT d.*,s.email,s.purpose,s.filters,s.confirmed_at,s.withdrawn_at,s.bounce_at,s.complaint_at,s.token_expires_at,s.user_id FROM directory_deliveries d JOIN directory_subscriptions s ON s.id=d.subscription_id WHERE (d.status='pending' OR (d.status='sending' AND d.lease_until<now())) AND d.attempts<3 ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1`
        )
      ).rows[0];
      if (!row) return null;
      // Expired in-flight requests may have reached the provider: require reconciliation, not blind replay.
      if (row.status === "sending") {
        await tx.execute(
          sql`UPDATE directory_deliveries SET status='needs_review',error='expired_provider_lease' WHERE id=${row.id}::uuid`
        );
        return { ...row, skip: true };
      }
      await tx.execute(
        sql`UPDATE directory_deliveries SET status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes' WHERE id=${row.id}::uuid`
      );
      return row;
    });
    if (!delivery) break;
    if (delivery.skip) continue;
    const id = String(delivery.subscription_id),
      confirmation = String(delivery.dedupe_key).startsWith("confirm:");
    if (
      delivery.withdrawn_at ||
      delivery.bounce_at ||
      delivery.complaint_at ||
      (!confirmation && !delivery.confirmed_at) ||
      (confirmation &&
        new Date(String(delivery.token_expires_at)).getTime() < Date.now())
    ) {
      await rows(
        sql`UPDATE directory_deliveries SET status='suppressed' WHERE id=${delivery.id}::uuid`
      );
      continue;
    }
    const base = getPublicSiteUrl();
    let subject = "Confirma tu solicitud en Zaltyko",
      text = "";
    if (confirmation) {
      const token = confirmationToken(
        id,
        new Date(String(delivery.token_expires_at)).toISOString()
      );
      text = `Has solicitado ${delivery.purpose === "kit" ? "el kit gratuito" : delivery.purpose === "marketing" ? "información comercial" : delivery.purpose === "claim_updates" ? "avisos sobre tus solicitudes de representación" : "avisos del calendario"} en Zaltyko. Confirma únicamente si lo solicitaste: ${base}/directorio/confirmar?id=${id}&token=${token}`;
    } else if (delivery.purpose === "kit") {
      subject = "Tu kit de organización de academias";
      text = `Descarga el kit gratuito: ${base}/recursos/kit-academias. Esta entrega no te suscribe a marketing.`;
    } else if (delivery.purpose === "claim_updates") {
      const match = String(delivery.dedupe_key).match(
        /^claim:([a-f0-9-]{36}):(pending|disputed|approved|rejected|withdrawn)$/
      );
      const claim = match
        ? (
            await rows(
              sql`SELECT c.status,c.decision,d.data->>'name' AS name FROM directory_claims c JOIN directory_entries d ON d.id=c.entry_id WHERE c.id=${match[1]}::uuid AND c.user_id=${delivery.user_id}::uuid AND c.status=${match[2]} LIMIT 1`
            )
          )[0]
        : undefined;
      if (!claim) {
        await rows(
          sql`UPDATE directory_deliveries SET status='empty' WHERE id=${delivery.id}::uuid`
        );
        continue;
      }
      const states: Record<string, string> = {
        pending: "pendiente de revisión",
        disputed: "en disputa",
        approved: "aprobada",
        rejected: "rechazada",
        withdrawn: "retirada",
      };
      subject = "Estado de tu solicitud de representación";
      text = `Tu solicitud para ${claim.name} está ${states[String(claim.status)]}. ${claim.decision ?? ""} Consulta tus solicitudes: ${base}/directorio/mis-fichas. Gestionar la ficha es gratuito y no activa ninguna suscripción.`;
    } else {
      let entries;
      if (delivery.purpose === "favorite_changes") {
        entries = await rows(
          sql`SELECT d.id,d.kind,d.data FROM directory_entries d JOIN directory_favorites f ON f.entry_id=d.id WHERE f.user_id=${delivery.user_id}::uuid AND d.kind='event' AND d.publication='published' AND d.merged_into IS NULL AND d.updated_at>now()-interval '1 day' AND d.academy_id IS NULL AND d.event_id IS NULL LIMIT 100`
        );
        if (!entries.length) {
          await rows(
            sql`UPDATE directory_deliveries SET status='empty' WHERE id=${delivery.id}::uuid`
          );
          continue;
        }
        subject = "Cambios en tus eventos favoritos";
      } else {
        entries = (
          await listEntries({
            kind: "event",
            ...(delivery.filters as Record<string, string>),
            limit: 100,
          })
        ).items;
        subject = "Tu resumen semanal de competiciones";
      }
      text = entries
        .map(
          (entry) =>
            `${(entry.data as { name: string }).name}: ${base}${entryPath(entry as Parameters<typeof entryPath>[0])}`
        )
        .join("\n");
    }
    const unsubscribe = `${base}/directorio/baja?id=${id}&token=${unsubscribeToken(id)}`;
    text += `\n\nGestionar o cancelar esta solicitud: ${unsubscribe}`;
    // Recheck consent immediately before delivery; withdrawal during content generation wins.
    const active = await rows(
      sql`SELECT 1 FROM directory_subscriptions WHERE id=${id}::uuid AND withdrawn_at IS NULL AND bounce_at IS NULL AND complaint_at IS NULL`
    );
    if (!active.length) {
      await rows(
        sql`UPDATE directory_deliveries SET status='suppressed' WHERE id=${delivery.id}::uuid`
      );
      continue;
    }
    try {
      const result = await deliver({
        to: String(delivery.email),
        subject,
        text,
        html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
        replyTo: process.env.BREVO_REPLY_TO ?? "",
      });
      if (result.simulated) throw new Error("simulated_delivery");
      await rows(
        sql`UPDATE directory_deliveries SET status='sent',provider_id=${result.messageId},sent_at=now(),lease_until=NULL WHERE id=${delivery.id}::uuid`
      );
      sent++;
    } catch {
      await rows(
        sql`UPDATE directory_deliveries SET status='needs_review',error='provider_result_requires_reconciliation',lease_until=NULL WHERE id=${delivery.id}::uuid`
      );
    }
  }
  return { sent };
}

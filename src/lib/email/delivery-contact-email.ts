import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { hasMarketingOptOut } from "@/lib/email/marketing-consent";
import { escapeHtml } from "@/lib/email/escape-html";

const SUPPORT = "hola@zaltyko.com";
const TEMPLATE = "delivery-contact-qa";
const SUBJECT = "[Zaltyko Contact] Soporte técnico — QA aislado";
const NAMESPACE = ["API_KEY", "QA_EMAIL", "QA_AUTH_USER_ID", "RUN_ID", "REQUEST_SHA256", "APPROVED_COMMIT_SHA", "EXPIRES_AT"] as const;
const FORBIDDEN = ["BREVO_API_KEY", "TWILIO_AUTH_TOKEN", "MAILGUN_API_KEY", "SENTRY_DSN", "SENTRY_AUTH_TOKEN", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_SAAS_LIVE_SECRET_KEY", "CRON_SECRET"];

/** Normalized contact semantics, after schema validation and HTML stripping.
 * Only submissionId/visitorId are excluded from approval. Nulls are explicit;
 * marketAccess uses the same validated object as persistence, with sorted keys.
 * This digest identifies an approved command; it does not establish consent.
 */
export interface DeliveryContactEmailCommand {
  name: string;
  email: string;
  academy: string | null;
  reason: string;
  plan: string | null;
  source: string;
  message: string;
  honeypot: string | null;
  directoryEntryId: string | null;
  marketAccess: Record<string, unknown> | null;
  submissionId: string;
  visitorId: string;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordered(entry)]));
  }
  return value;
}

export function deliveryContactEmailRequestSha256(command: DeliveryContactEmailCommand): string {
  const { submissionId: _submissionId, visitorId: _visitorId, ...semantics } = command;
  return createHash("sha256").update(JSON.stringify(ordered(semantics))).digest("hex");
}

type Permit = { apiKey: string; email: string; userId: string; runId: string; digest: string; commit: string; expiresAt: string };
type SkipReason = "disabled" | "configuration" | "actor" | "request" | "suppressed" | "duplicate" | "unavailable" | "expired";
export type DeliveryContactEmailResult =
  | { outcome: "skipped"; reason: SkipReason }
  | { outcome: "accepted" | "failed" | "uncertain" };

/** Same closed permit as preflight; runtime additionally rejects CI (Vercel's
 * build gate admits its CI=1 system variable). No shared sender reads this. */
function readPermit(): Permit | null {
  const e = process.env;
  if (e.ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED !== "true" ||
    e.ZALTYKO_DELIVERY_PREVIEW !== "true" || e.VERCEL_ENV !== "preview" ||
    e.VERCEL !== "1" || e.NODE_ENV !== "production" || e.CI || e.GITHUB_ACTIONS ||
    e.VERCEL_GIT_COMMIT_REF !== "codex/mvp-main-bridge-20261025" ||
    e.ZALTYKO_TEAM_ACCESS_ENABLED === "true" || FORBIDDEN.some((key) => Boolean(e[key]))) return null;
  const values = Object.fromEntries(NAMESPACE.map((key) => [key, e[`DELIVERY_CONTACT_EMAIL_${key}`] ?? ""]));
  if (NAMESPACE.some((key) => !values[key] || values[key] !== values[key].trim()) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.QA_EMAIL) || values.QA_EMAIL !== values.QA_EMAIL.toLowerCase() ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(values.QA_AUTH_USER_ID) ||
    !/^[a-z0-9][a-z0-9_-]{15,79}$/.test(values.RUN_ID) ||
    !/^[0-9a-f]{64}$/.test(values.REQUEST_SHA256) ||
    !/^[0-9a-f]{40}$/.test(values.APPROVED_COMMIT_SHA) || values.APPROVED_COMMIT_SHA !== e.VERCEL_GIT_COMMIT_SHA ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(values.EXPIRES_AT)) return null;
  const remaining = Date.parse(values.EXPIRES_AT) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 3_600_000) return null;
  const canonicalExpiry = values.EXPIRES_AT.includes(".") ? values.EXPIRES_AT : values.EXPIRES_AT.replace("Z", ".000Z");
  if (new Date(values.EXPIRES_AT).toISOString() !== canonicalExpiry) return null;
  return { apiKey: values.API_KEY, email: values.QA_EMAIL, userId: values.QA_AUTH_USER_ID,
    runId: values.RUN_ID, digest: values.REQUEST_SHA256, commit: values.APPROVED_COMMIT_SHA, expiresAt: values.EXPIRES_AT };
}

function samePermit(permit: Permit): boolean {
  const current = readPermit();
  return current !== null && (Object.keys(permit) as (keyof Permit)[]).every((key) => current[key] === permit[key]);
}

/** One private contact adapter. No caller-selected recipient, credential or transport.
 * Pending/failed/uncertain rows permanently consume this run's attempt. No retries.
 * A successful API acceptance is not evidence of Inbox receipt.
 */
export async function sendDeliveryContactEmail(command: DeliveryContactEmailCommand): Promise<DeliveryContactEmailResult> {
  if (process.env.ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED !== "true") return { outcome: "skipped", reason: "disabled" };
  const permit = readPermit();
  if (!permit) return { outcome: "skipped", reason: "configuration" };
  // The approved rehearsal uses the ordinary support form, without academy access,
  // directory attribution or market-access provisioning semantics.
  if (command.email !== permit.email || command.reason !== "support" || command.source !== "public_contact" ||
    command.academy !== null || command.plan !== null || command.directoryEntryId !== null || command.marketAccess !== null ||
    command.honeypot || deliveryContactEmailRequestSha256(command) !== permit.digest) {
    return { outcome: "skipped", reason: "request" };
  }
  try {
    // Verify the cookie session directly with Auth; never use dev/internal resolvers,
    // request headers, metadata or a client-supplied actor as authorization.
    const client = await createClient(await cookies());
    const { data, error } = await client.auth.getUser();
    const actor = data.user;
    if (error || !actor || actor.id !== permit.userId || !actor.email_confirmed_at ||
      !actor.email || actor.email.toLowerCase() !== permit.email) return { outcome: "skipped", reason: "actor" };
    if (await hasMarketingOptOut(SUPPORT)) return { outcome: "skipped", reason: "suppressed" };
  } catch {
    return { outcome: "skipped", reason: "unavailable" };
  }

  const key = `email:delivery-contact-qa:${permit.runId}`;
  let logId: string | undefined;
  try {
    logId = await db.transaction(async (tx) => {
      // Hold the table through reservation. The catalog guard plus ON CONFLICT
      // require an unconditional unique index; any reservation error blocks fetch.
      await tx.execute(sql`select id, idempotency_key, to_email, subject, template, status, metadata, sent_at, error_message from email_logs where false`);
      const signature = await tx.execute(sql`select exists (
        select 1 from pg_index i
        join pg_class t on t.oid=i.indrelid
        join pg_attribute a on a.attrelid=t.oid and a.attnum=i.indkey[0]
        where t.oid=to_regclass('email_logs') and t.relkind='r'
          and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
          and i.indnkeyatts=1 and i.indnatts=1 and i.indpred is null and i.indexprs is null
          and a.attname='idempotency_key' and a.atttypid='text'::regtype
      ) as valid`);
      if (signature.rows[0]?.valid !== true) throw new Error("delivery_email_schema_unavailable");
      if (!samePermit(permit)) throw new Error("delivery_email_permit_closed");
      const inserted = await tx.execute(sql`insert into email_logs
        (to_email, subject, template, status, idempotency_key, metadata)
        values (${SUPPORT}, ${SUBJECT}, ${TEMPLATE}, 'pending', ${key}, ${JSON.stringify({ deliveryContactQa: true })}::jsonb)
        on conflict (idempotency_key) do nothing returning id`);
      const id = inserted.rows[0]?.id;
      return typeof id === "string" ? id : undefined;
    });
  } catch {
    return { outcome: "skipped", reason: "unavailable" };
  }
  if (!logId) return { outcome: "skipped", reason: "duplicate" };

  async function record(status: "sent" | "failed", result: string, messageId?: string): Promise<boolean> {
    try {
      const updated = await db.transaction(async (tx) => tx.execute(sql`update email_logs
        set status=${status}, sent_at=${status === "sent" ? new Date() : null},
          error_message=${status === "failed" ? result : null},
          metadata=${JSON.stringify({ deliveryContactQa: true, result, ...(messageId ? { messageId } : {}) })}::jsonb
        where id=${logId}::uuid and idempotency_key=${key} and status='pending' returning id`));
      return updated.rows.length === 1;
    } catch { return false; }
  }

  if (!samePermit(permit)) {
    await record("failed", "permit_closed_before_fetch");
    return { outcome: "skipped", reason: "expired" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "api-key": permit.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: SUPPORT, name: "Zaltyko" }, to: [{ email: SUPPORT }],
        replyTo: { email: permit.email }, subject: SUBJECT,
        textContent: `Nombre: ${command.name}\nEmail: ${command.email}\n\nMensaje:\n${command.message}`,
        htmlContent: `<p>${escapeHtml(command.name)}</p><p>${escapeHtml(command.email)}</p><p>${escapeHtml(command.message).replace(/\n/g, "<br>")}</p>`,
      }),
    });
    if (!response.ok) {
      const uncertain = response.status >= 500 || response.status === 429;
      await record("failed", uncertain ? "provider_uncertain" : "provider_rejected");
      return { outcome: uncertain ? "uncertain" : "failed" };
    }
    const payload: unknown = await response.json().catch(() => null);
    const accepted = payload !== null && typeof payload === "object" ? payload as Record<string, unknown> : null;
    if (!accepted || accepted.simulated === true || typeof accepted.messageId !== "string" ||
      !accepted.messageId.trim() || accepted.messageId.length > 1_000 || accepted.messageId.includes(permit.apiKey)) {
      await record("failed", "acceptance_unconfirmed");
      return { outcome: "uncertain" };
    }
    return await record("sent", "api_accepted", accepted.messageId)
      ? { outcome: "accepted" } : { outcome: "uncertain" };
  } catch {
    await record("failed", "transport_uncertain");
    return { outcome: "uncertain" };
  } finally {
    clearTimeout(timeout);
  }
}

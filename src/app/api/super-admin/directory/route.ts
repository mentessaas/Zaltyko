import { recordGrowthEvent } from "@/lib/growth/events";
import { db } from "@/db";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withSuperAdmin } from "@/lib/authz";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import {
  rows,
  bulkPublication,
  linkOperationalEntry,
  createEntry,
  decideClaim,
  editEntry,
  setPublication,
  revokeGrant,
  decideRevision,
  mergeEntries,
} from "@/lib/directory/service";
import { directoryFailure } from "@/lib/directory/auth";
import {
  EntryInputSchema,
  flag,
  publicationStates,
} from "@/lib/directory/contracts";
import {
  importCandidates,
  acceptImportRow,
  fetchSourceCandidates,
} from "@/lib/directory/imports";
import { retryDelivery } from "@/lib/directory/communications";
import { sourceAuthorizationProblem } from "@/lib/directory/source-authorization";
export const dynamic = "force-dynamic";
export const GET = withSuperAdmin(async (request) => {
  if (!flag("admin"))
    return apiError(
      "DIRECTORY_DISABLED",
      "Administración todavía no activa",
      503
    );
  try {
    const url = new URL(request.url),
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(url.searchParams.get("page") ?? 1);
    const section = z
      .enum([
        "entries",
        "claims",
        "revisions",
        "sources",
        "batches",
        "imports",
        "audit",
        "subscriptions",
        "deliveries",
      ])
      .parse(url.searchParams.get("section") ?? "entries");
    const table = {
      entries: "directory_entries",
      claims: "directory_claims",
      revisions: "directory_revisions",
      sources: "directory_sources",
      batches: "directory_batches",
      imports: "directory_import_rows",
      audit: "directory_audit",
      subscriptions: "directory_subscriptions",
      deliveries: "directory_deliveries",
    }[section];
    const order =
      section === "sources"
        ? sql`name`
        : section === "entries"
          ? sql`updated_at DESC`
          : sql`created_at DESC`;
    const projection =
      section === "subscriptions"
        ? sql`id,purpose,source,policy_version,confirmed_at,withdrawn_at,bounce_at,complaint_at,created_at`
        : sql`*`;
    const items =
      section === "deliveries"
        ? await rows(
            sql`SELECT d.id,d.subscription_id,d.dedupe_key,d.status,d.attempts,d.lease_until,d.provider_id,d.error,d.created_at,d.sent_at,s.email,s.purpose FROM directory_deliveries d JOIN directory_subscriptions s ON s.id=d.subscription_id ORDER BY d.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`
          )
        : section === "claims"
          ? await rows(
              sql`SELECT c.*,d.data->>'name' AS name,u.email AS requester_email FROM directory_claims c JOIN directory_entries d ON d.id=c.entry_id JOIN auth.users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`
            )
          : section === "revisions"
            ? await rows(
                sql`SELECT r.*,d.data->>'name' AS name FROM directory_revisions r LEFT JOIN directory_entries d ON d.id=r.entry_id ORDER BY r.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`
              )
            : await rows(
                sql`SELECT ${projection} FROM ${sql.identifier(table)} ORDER BY ${order} LIMIT 50 OFFSET ${(page - 1) * 50}`
              );
    return apiSuccess({ items, page, hasNextPage: items.length === 50 });
  } catch (e) {
    return directoryFailure(e);
  }
});
const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("link_operational"),
    id: z.string().uuid(),
    academyId: z.string().uuid(),
    confirm: z.literal(true),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("bulk_publication"),
    ids: z.array(z.string().uuid()).min(1).max(50),
    publication: z.enum(["published", "withdrawn"]),
    reason: z.string().trim().min(5).max(1000),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.object({ action: z.literal("create"), ...EntryInputSchema.shape }),
  z.object({
    action: z.literal("edit"),
    id: z.string().uuid(),
    data: z.unknown(),
  }),
  z.object({
    action: z.literal("publish"),
    id: z.string().uuid(),
    publication: z.enum(publicationStates),
  }),
  z.object({
    action: z.literal("claim"),
    id: z.string().uuid(),
    approve: z.boolean(),
    transfer: z.boolean().optional(),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("revision"),
    id: z.string().uuid(),
    approve: z.boolean(),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("revoke"),
    id: z.string().uuid(),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("merge"),
    id: z.string().uuid(),
    target: z.string().uuid(),
  }),
  z.object({
    action: z.literal("import"),
    sourceId: z.string().uuid(),
    format: z.enum(["json", "csv"]),
    content: z.string().max(2000000),
  }),
  z.object({
    action: z.literal("accept_import"),
    id: z.string().uuid(),
    target: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal("fetch_source"), id: z.string().uuid() }),
  z.object({
    action: z.literal("retry_delivery"),
    id: z.string().uuid(),
    providerNotAccepted: z.literal(true),
    reason: z.string().trim().min(20).max(1000),
  }),
  z.object({
    action: z.literal("retain_evidence"),
    id: z.string().uuid(),
    retain: z.boolean(),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal("source"),
    name: z.string().min(2).max(200),
    url: z.string().url().max(2000),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    termsUrl: z.string().url().nullable(),
    authorization: z.string().max(2000).nullable(),
    authorizationConfirmed: z.boolean().default(false),
    enabled: z.boolean(),
    adapter: z.enum(["manual", "rfeg", "fdpg", "cbg"]),
  }),
]);
export const POST = withSuperAdmin(async (request, context) => {
  if (!flag("admin"))
    return apiError(
      "DIRECTORY_DISABLED",
      "Administración todavía no activa",
      503
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return apiError("INVALID_ORIGIN", "Origen no permitido", 403);
  try {
    const body = ActionSchema.parse(await request.json());
    switch (body.action) {
      case "link_operational":
        return apiSuccess(
          await linkOperationalEntry(
            body.id,
            body.academyId,
            context.userId,
            body.reason
          )
        );
      case "bulk_publication":
        return apiSuccess(
          await bulkPublication(
            body.ids,
            body.publication,
            context.userId,
            body.reason,
            body.fingerprint
          )
        );
      case "create":
        return apiCreated(
          await createEntry(body.kind, body.data, context.userId)
        );
      case "edit":
        return apiSuccess(
          await editEntry(body.id, context.userId, body.data, true)
        );
      case "publish":
        return apiSuccess(
          await setPublication(body.id, context.userId, body.publication)
        );
      case "claim": {
        const result = await decideClaim(
          body.id,
          context.userId,
          body.approve,
          body.reason,
          body.transfer
        );
        if (body.approve)
          await recordGrowthEvent({
            eventName: "directory_claim_approved",
            source: "directory",
            idempotencyKey: `directory:claim-approved:${body.id}`,
            properties: { audience: "representative" },
          });
        return apiSuccess(result);
      }
      case "revision":
        return apiSuccess(
          await decideRevision(
            body.id,
            context.userId,
            body.approve,
            body.reason
          )
        );
      case "revoke":
        return apiSuccess(
          await revokeGrant(body.id, context.userId, body.reason)
        );
      case "merge":
        return apiSuccess(
          await mergeEntries(body.id, body.target, context.userId)
        );
      case "import":
        return apiSuccess(
          await importCandidates(body.sourceId, body.content, body.format)
        );
      case "accept_import":
        return apiSuccess(
          await acceptImportRow(body.id, context.userId, body.target)
        );
      case "retain_evidence": {
        return apiSuccess(
          await db.transaction(async (tx) => {
            const claim = (
              await tx.execute(
                sql`UPDATE directory_claims SET retain_evidence=${body.retain} WHERE id=${body.id}::uuid RETURNING entry_id`
              )
            ).rows[0];
            if (!claim) throw new Error("Claim not found");
            await tx.execute(
              sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${claim.entry_id}::uuid,${context.userId}::uuid,'evidence_retention_changed',${JSON.stringify({ claimId: body.id, retain: body.retain, reason: body.reason })}::jsonb)`
            );
            return { retained: body.retain };
          })
        );
      }
      case "fetch_source":
        return apiSuccess(await fetchSourceCandidates(body.id));
      case "retry_delivery":
        return apiSuccess(
          await retryDelivery(
            body.id,
            context.userId,
            body.providerNotAccepted,
            body.reason
          )
        );
      case "source": {
        const permissionProblem = sourceAuthorizationProblem(body);
        if (body.enabled && (!body.authorizationConfirmed || permissionProblem))
          return apiError(
            "SOURCE_PERMISSION_REQUIRED",
            !body.authorizationConfirmed
              ? "Confirma que has revisado las condiciones y registrado la autorización escrita."
              : permissionProblem!,
            400
          );
        const source = await db.transaction(async (tx) => {
          const saved = (
            await tx.execute(
              sql`INSERT INTO directory_sources(name,url,country_code,terms_url,"authorization",adapter,enabled) VALUES(${body.name},${body.url},${body.countryCode},${body.termsUrl},${body.authorization},${body.adapter},${body.enabled}) ON CONFLICT(url) DO UPDATE SET name=EXCLUDED.name,terms_url=EXCLUDED.terms_url,"authorization"=EXCLUDED."authorization",adapter=EXCLUDED.adapter,enabled=EXCLUDED.enabled RETURNING id`
            )
          ).rows[0];
          await tx.execute(
            sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(NULL,${context.userId}::uuid,${body.enabled ? "source_authorization_confirmed" : "source_registry_updated"},${JSON.stringify({ sourceId: saved.id, sourceName: body.name, sourceUrl: body.url, countryCode: body.countryCode, adapter: body.adapter, termsUrl: body.termsUrl, authorizationReference: body.authorization, enabled: body.enabled })}::jsonb)`
          );
          return saved;
        });
        return apiCreated(source);
      }
    }
  } catch (e) {
    return directoryFailure(e);
  }
});

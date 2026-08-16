import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { marketingOutreach } from "@/db/schema/marketing-outreach";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withAgentAuth } from "@/lib/authz";
import { MarketingOutreachInputSchema } from "@/lib/growth/marketing-outreach";
import { logger } from "@/lib/logger";

const isoCountryCode = /^[A-Z]{2}$/;

type OutreachInput = z.infer<typeof MarketingOutreachInputSchema>;

function toTimestamp(value: OutreachInput["sentAt"]): Date | undefined {
  if (value === undefined || value === null) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function toOptionalString(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value;
}

function parseDateParam(value: string | null, field: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} invalido: ${value}`);
  }
  return parsed;
}

export const POST = withAgentAuth(async (request, context) => {
  const json = await request.json().catch(() => null);
  const parsed = MarketingOutreachInputSchema.safeParse(json);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Solicitud inválida",
      400,
      parsed.error.issues
    );
  }

  const data = parsed.data;
  const insertValues = {
    tenantId: toOptionalString(data.tenantId) ?? null,
    campaignId: data.campaignId,
    channel: data.channel,
    modality: data.modality ?? null,
    countryCode: data.countryCode ?? null,
    city: data.city ?? null,
    academyFingerprint: data.academyFingerprint,
    academyId: data.academyId ?? null,
    attemptNumber: data.attemptNumber,
    templateId: data.templateId ?? null,
    idempotencyKey: data.idempotencyKey,
    sentAt: toTimestamp(data.sentAt),
    replyAt: toTimestamp(data.replyAt),
    replyKind: data.replyKind ?? null,
    consentAt: toTimestamp(data.consentAt),
    consentTextVersion: data.consentTextVersion ?? null,
    demoSessionId: data.demoSessionId ?? null,
    source: data.source,
    createdByAgentId: context.agentId,
  };

  try {
    const [row] = await db
      .insert(marketingOutreach)
      .values(insertValues)
      .onConflictDoNothing({ target: marketingOutreach.idempotencyKey })
      .returning({ id: marketingOutreach.id });

    if (!row) {
      const existing = await db
        .select({ id: marketingOutreach.id })
        .from(marketingOutreach)
        .where(eq(marketingOutreach.idempotencyKey, data.idempotencyKey))
        .limit(1);
      logger.info("marketing_outreach idempotency replay", {
        idempotencyKey: data.idempotencyKey,
        campaignId: data.campaignId,
        existingId: existing[0]?.id,
      });
      return apiCreated({ id: existing[0]?.id ?? null, deduped: true });
    }

    return apiCreated({ id: row.id, deduped: false });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : null;
    if (code === "23514") {
      return apiError(
        "CHECK_CONSTRAINT_VIOLATION",
        "Los datos no cumplen las invariantes de marketing_outreach",
        422,
        { hint: "Revisar timelines, consent_at, modality, channel, country_code" }
      );
    }
    if (code === "23503") {
      return apiError(
        "FK_VIOLATION",
        "academyId no existe",
        422
      );
    }
    throw error;
  }
});

const outreachListSchema = z.object({
  campaign: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  country: z.string().regex(isoCountryCode).optional(),
});

export const GET = withAgentAuth(async (request) => {
  const url = new URL(request.url);
  const query = outreachListSchema.safeParse({
    campaign: url.searchParams.get("campaign") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    country: url.searchParams.get("country") ?? undefined,
  });
  if (!query.success) {
    return apiError(
      "VALIDATION_ERROR",
      query.error.issues[0]?.message ?? "Parámetros inválidos",
      400,
      query.error.issues
    );
  }

  let fromDate: Date | undefined;
  let toDate: Date | undefined;
  try {
    fromDate = parseDateParam(query.data.from ?? null, "from");
    toDate = parseDateParam(query.data.to ?? null, "to");
  } catch (err) {
    return apiError(
      "VALIDATION_ERROR",
      err instanceof Error ? err.message : "Rango invalido",
      400
    );
  }

  const filters = [];
  if (query.data.campaign) {
    filters.push(eq(marketingOutreach.campaignId, query.data.campaign));
  }
  if (query.data.country) {
    filters.push(eq(marketingOutreach.countryCode, query.data.country));
  }
  if (fromDate) {
    filters.push(gte(marketingOutreach.sentAt, fromDate));
  }
  if (toDate) {
    filters.push(lte(marketingOutreach.sentAt, toDate));
  }
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(marketingOutreach)
    .where(whereClause ?? sql`true`)
    .orderBy(desc(marketingOutreach.sentAt), desc(marketingOutreach.createdAt))
    .limit(500);

  const denominatorsRow = await db
    .select({
      attempts: count(sql`*`),
      replies: count(sql`case when ${marketingOutreach.replyAt} is not null then 1 end`),
      consented: count(sql`case when ${marketingOutreach.consentAt} is not null then 1 end`),
      demosHeld: count(sql`case when ${marketingOutreach.demoSessionId} is not null then 1 end`),
    })
    .from(marketingOutreach)
    .where(whereClause ?? sql`true`);

  const summary = denominatorsRow[0] ?? {
    attempts: 0,
    replies: 0,
    consented: 0,
    demosHeld: 0,
  };

  return apiSuccess({
    items: rows,
    summary: {
      attempts: Number(summary.attempts),
      replies: Number(summary.replies),
      consented: Number(summary.consented),
      demosHeld: Number(summary.demosHeld),
    },
  });
});

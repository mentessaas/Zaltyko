/**
 * Athlete import from Excel or CSV (O4): the only entry point. Its modules in
 * ./athlete-import/ are internal (ESLint boundary in
 * eslint.internal-boundaries.json).
 *
 * - Preview reads only: it parses the file, maps the columns, validates every
 *   row and checks it against the academy (duplicates, groups, tutors, group
 *   places and the plan limit). Nothing is written.
 * - Confirmation parses and classifies the same file outside any lock, then
 *   takes the command and organization locks (shared with every athlete
 *   creation), refuses a read-only academy, locks the target groups, decides
 *   every row again against the current state and writes the creatable ones
 *   in one transaction. The Idempotency-Key replays the stored result.
 *
 * Who: an active owner or admin with every site, as the manual intake.
 * Database errors leave this module without their parameters, which carry
 * names and contacts of minors and their families.
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { z, ZodError } from "zod";

import { db } from "@/db";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  isRetryableDbConflict,
  retryableDbConflictError,
} from "@/modules/shared/infrastructure/retryable-db-conflict";
import {
  findOutboxEvent,
  lockCommand,
  lockGroupCapacity,
} from "@/modules/shared/infrastructure/transactional-records";

import {
  ATHLETE_IMPORT_FIELDS,
  type AthleteImportField,
  type AthleteImportMapping,
  deriveImportMapping,
  mappingProblems,
  type NormalizedImportRow,
  validateImportRow,
} from "../domain/athlete-import-rows";
import { type ParsedImportFile, parseAthleteImportFile } from "./athlete-import-file";
import { classifyImportRows } from "./athlete-import/classify";
import { authorizeImport, loadAcademyToday, loadImportContext } from "./athlete-import/context";
import type { AthleteImportPreview, AthleteImportResult } from "./athlete-import/model";
import { buildPreview, mappingOnlyPreview } from "./athlete-import/preview";
import { ATHLETE_IMPORT_EVENT, importResultPayloadSchema, writeImport } from "./athlete-import/write";

export type {
  AthleteImportPreview,
  AthleteImportPreviewRow,
  AthleteImportResult,
  AthleteImportRowStatus,
} from "./athlete-import/model";
export { ATHLETE_IMPORT_EVENT };

const guidSchema = z.guid().transform((value) => value.toLowerCase());

export const athleteImportMappingSchema = z
  .object(
    Object.fromEntries(
      ATHLETE_IMPORT_FIELDS.map((field) => [field, z.number().int().min(0).max(49).nullable()])
    ) as Record<AthleteImportField, z.ZodNullable<z.ZodNumber>>
  )
  .strict();

const baseInputSchema = z
  .object({
    organizationId: guidSchema,
    userId: guidSchema,
    actor: operationalActorSchema.strict(),
    fileBytes: z.instanceof(Uint8Array),
    mapping: athleteImportMappingSchema.nullable().optional(),
  })
  .strict();
const confirmInputSchema = baseInputSchema
  .extend({
    mapping: athleteImportMappingSchema,
    previewToken: z.string().regex(/^[a-f0-9]{64}$/u),
    idempotencyKey: z.string().trim().min(8).max(150),
    legalBasisConfirmed: z.literal(true),
  })
  .strict();

/**
 * Fingerprint of what the Owner previewed: the file, the column mapping, the
 * academy and the user. A token never confirms another academy's or another
 * user's import.
 */
export function athleteImportPreviewToken(
  bytes: Uint8Array,
  mapping: AthleteImportMapping,
  scope: { organizationId: string; userId: string }
): string {
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const orderedMapping = ATHLETE_IMPORT_FIELDS.map((field) => mapping[field]);
  return createHash("sha256")
    .update(
      `athlete-import:v2:${scope.organizationId.toLowerCase()}:${scope.userId.toLowerCase()}:${fileHash}:${JSON.stringify(orderedMapping)}`
    )
    .digest("hex");
}

function sqlState(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Drizzle puts the statement parameters in its error message; here they are
 * names, birth dates and contacts. Anything that is not an OperationalError
 * leaves as a bare error with the SQLSTATE only, so neither logs nor Sentry
 * receive them.
 */
async function withoutPersonalData<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OperationalError || error instanceof ZodError) throw error;
    // Deadlock, serialization failure or lock not available: the whole
    // transaction rolled back, so the same command with the same
    // Idempotency-Key can simply be sent again. The import screen keeps its key
    // per preview, whatever the status, so the shared 409 fits.
    if (isRetryableDbConflict(error)) {
      throw retryableDbConflictError(
        "Otra operación de la academia estaba cambiando a la vez los mismos datos y la importación se ha cancelado sin guardar nada. Vuelve a pulsar «Importar»: se repite la misma operación y no se duplicará nada."
      );
    }
    const code = sqlState(error);
    throw new Error(`La importación de gimnastas falló${code ? ` (SQLSTATE ${code})` : ""}.`);
  }
}

function validateRows(file: ParsedImportFile, mapping: AthleteImportMapping, today: string): NormalizedImportRow[] {
  return file.rows.map((row) => validateImportRow(row.cells, mapping, row.row, today));
}

const staleGroups = () =>
  new OperationalError(
    "IMPORT_PREVIEW_STALE",
    "Los grupos de la academia han cambiado desde la vista previa. Vuelve a generarla antes de importar.",
    409
  );

export async function previewAthleteImport(
  command: z.input<typeof baseInputSchema>
): Promise<AthleteImportPreview> {
  const input = baseInputSchema.parse(command);
  return withoutPersonalData(async () => {
    const file = parseAthleteImportFile(input.fileBytes);
    const mapping = input.mapping ?? deriveImportMapping(file.headers);
    const token = athleteImportPreviewToken(input.fileBytes, mapping, input);
    return db.transaction(async (tx) => {
      await authorizeImport(tx, input, false);
      const problems = mappingProblems(mapping, file.headers.length);
      if (problems.length > 0) return mappingOnlyPreview(file, mapping, problems, token);
      const today = await loadAcademyToday(tx, input.organizationId);
      const rows = validateRows(file, mapping, today);
      const context = await loadImportContext(tx, input.organizationId, today, rows);
      return buildPreview(file, mapping, token, classifyImportRows(rows, context), context);
    });
  });
}

export async function confirmAthleteImport(
  command: z.input<typeof confirmInputSchema>
): Promise<AthleteImportResult> {
  const input = confirmInputSchema.parse(command);
  return withoutPersonalData(async () => {
    if (athleteImportPreviewToken(input.fileBytes, input.mapping, input) !== input.previewToken) {
      throw new OperationalError(
        "IMPORT_PREVIEW_STALE",
        "El fichero o las columnas no coinciden con la vista previa. Vuelve a generarla antes de importar.",
        409
      );
    }
    // The file is parsed and classified once, outside the organization lock.
    const file = parseAthleteImportFile(input.fileBytes);
    const problems = mappingProblems(input.mapping, file.headers.length);
    if (problems.length > 0) {
      throw new OperationalError("IMPORT_FILE_INVALID", problems.join(" "), 422, { reason: "MAPPING" });
    }
    const prepared = await db.transaction(async (tx) => {
      await authorizeImport(tx, input, false);
      const today = await loadAcademyToday(tx, input.organizationId);
      const rows = validateRows(file, input.mapping, today);
      const context = await loadImportContext(tx, input.organizationId, today, rows);
      const groupIds = [
        ...new Set(
          classifyImportRows(rows, context).flatMap((item) => (item.plan?.group ? [item.plan.group.groupId] : []))
        ),
      ].sort();
      return { rows, groupIds };
    });

    return db.transaction(async (tx) => {
      await lockCommand(tx, input.organizationId, input.idempotencyKey);
      await authorizeImport(tx, input, true);

      const prior = await findOutboxEvent(tx, {
        organizationId: input.organizationId,
        eventName: ATHLETE_IMPORT_EVENT,
        idempotencyKey: input.idempotencyKey,
      });
      if (prior) {
        const payload = importResultPayloadSchema.safeParse(prior.payload);
        if (
          !payload.success ||
          payload.data.importFingerprint !== input.previewToken ||
          payload.data.actorMemberId !== input.actor.memberId
        ) {
          throw new OperationalError("IDEMPOTENCY_CONFLICT", "La clave ya se usó para otra importación", 409);
        }
        return {
          batchId: payload.data.batchId,
          created: payload.data.created,
          skipped: payload.data.skipped,
          replayed: true,
        };
      }
      const keyUse = await tx.execute(sql`
        select
          exists (
            select 1 from zaltyko.audit_log
            where organization_id = ${input.organizationId}::uuid and idempotency_key = ${input.idempotencyKey}
          ) as audit_used,
          exists (
            select 1 from zaltyko.outbox_events
            where organization_id = ${input.organizationId}::uuid and idempotency_key = ${input.idempotencyKey}
          ) as event_used
      `);
      const used = keyUse.rows[0] as { audit_used?: unknown; event_used?: unknown } | undefined;
      if (!used || used.audit_used !== false || used.event_used !== false) {
        throw new OperationalError("IDEMPOTENCY_CONFLICT", "La clave de idempotencia ya se utilizó en otra operación", 409);
      }

      // Organization row lock (shared with every athlete creation); refuses a
      // read-only academy.
      await assertOrganizationOperationalWritable(tx, input.organizationId);
      // Group places, in a fixed order, for the groups the file targets.
      for (const groupId of prepared.groupIds) await lockGroupCapacity(tx, input.organizationId, groupId);

      // Decide again on the state now visible under the locks.
      const today = await loadAcademyToday(tx, input.organizationId);
      const context = await loadImportContext(tx, input.organizationId, today, prepared.rows);
      const classified = classifyImportRows(prepared.rows, context);
      const locked = new Set(prepared.groupIds);
      if (classified.some((item) => item.plan?.group && !locked.has(item.plan.group.groupId))) throw staleGroups();

      return writeImport(tx, {
        organizationId: input.organizationId,
        userId: input.userId,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        previewToken: input.previewToken,
        today,
        classified,
      });
    });
  });
}

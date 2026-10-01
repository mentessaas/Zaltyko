import { publicDirectoryCte } from "./projection";
import { createHash, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  EntryInputSchema,
  EntryDataSchema,
  entryPath,
  parseEntryId,
  publicationError,
  requiresReview,
  slugify,
  type DirectoryEntry,
  type DirectoryKind,
  type EntryData,
} from "./contracts";

export class DirectoryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}
type Row = Record<string, unknown>;
export async function rows(statement: ReturnType<typeof sql>): Promise<Row[]> {
  return (await db.execute(statement)).rows as Row[];
}
function mapEntry(row: Row): DirectoryEntry {
  return {
    id: String(row.id),
    kind: row.kind as DirectoryKind,
    data: row.data as EntryData,
    publication: row.publication as DirectoryEntry["publication"],
    representation: row.representation as DirectoryEntry["representation"],
    slug: String(row.slug ?? ""),
    reviewedAt: row.reviewed_at
      ? new Date(String(row.reviewed_at)).toISOString()
      : null,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    academyId: row.academy_id as string | null,
    eventId: row.event_id as string | null,
    mergedInto: row.merged_into as string | null,
  };
}
const publicEligibility = sql`d.publication='published' AND d.merged_into IS NULL
 AND (d.academy_id IS NULL OR EXISTS(SELECT 1 FROM academies a WHERE a.id=d.academy_id AND a.is_public AND NOT a.is_suspended AND a.status IN ('active','trial')))
 AND (d.event_id IS NULL OR EXISTS(SELECT 1 FROM events e JOIN academies a ON a.id=e.academy_id WHERE e.id=d.event_id AND e.is_public AND e.status='published' AND a.is_public AND NOT a.is_suspended AND a.status IN ('active','trial')))`;
type AcademyIdentityLookup = {
  name: string;
  countryCode: string;
  region?: string | null;
  city?: string | null;
};

function normalizedIdentitySql(value: SQL) {
  return sql`lower(trim(regexp_replace(regexp_replace(normalize(${value},NFD), U&'[\\0300-\\036f]', '', 'g'),'[[:space:]]+',' ','g')))`;
}

// Return only public matches. This query must never reveal a private workspace.
export function academyDuplicateQuery(
  input: AcademyIdentityLookup & { excludeEntryId?: string }
) {
  const name=input.name.trim().replace(/\s+/g," ");
  const region=input.region?.trim().replace(/\s+/g," ") ?? "";
  const city=input.city?.trim().replace(/\s+/g," ") ?? "";
  const excludedEntry = input.excludeEntryId
    ? sql`AND d.id<>${input.excludeEntryId}::uuid`
    : sql``;
  return sql`${publicDirectoryCte()} SELECT d.id,d.kind,d.slug,d.academy_id,d.event_id,d.data FROM projected d
    WHERE ${publicEligibility} AND d.kind='academy'
    AND ${normalizedIdentitySql(sql`d.data->>'name'`)}=${normalizedIdentitySql(sql`${name}`)}
    AND upper(d.data->>'countryCode')=upper(${input.countryCode})
    AND (${region}='' OR COALESCE(trim(d.data->>'region'),'')='' OR ${normalizedIdentitySql(sql`d.data->>'region'`)}=${normalizedIdentitySql(sql`${region}`)})
    AND (${city}='' OR COALESCE(trim(d.data->>'city'),'')='' OR ${normalizedIdentitySql(sql`d.data->>'city'`)}=${normalizedIdentitySql(sql`${city}`)})
    ${excludedEntry}
    ORDER BY d.id LIMIT 5`;
}

// A private-safe existence check catches operational duplicates without returning
// their IDs, names, owners, or any other tenant data to the caller.
export function academyOperationalIdentityQuery(input: AcademyIdentityLookup) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const region = input.region?.trim().replace(/\s+/g, " ") ?? "";
  const city = input.city?.trim().replace(/\s+/g, " ") ?? "";
  return sql`SELECT EXISTS (
    SELECT 1 FROM academies a
    WHERE ${normalizedIdentitySql(sql`a.name`)}=${normalizedIdentitySql(sql`${name}`)}
      AND (NULLIF(trim(a.country_code),'') IS NULL OR upper(a.country_code)=upper(${input.countryCode}))
      AND (${region}='' OR COALESCE(trim(a.region),'')='' OR ${normalizedIdentitySql(sql`a.region`)}=${normalizedIdentitySql(sql`${region}`)})
      AND (${city}='' OR COALESCE(trim(a.city),'')='' OR ${normalizedIdentitySql(sql`a.city`)}=${normalizedIdentitySql(sql`${city}`)})
  ) AS exists`;
}

// Serialize same-name/country creations across locations because unknown
// locations are treated as ambiguous matches by the duplicate queries.
export function academyDuplicateLock(input: AcademyIdentityLookup) {
  return [input.countryCode,input.name]
    .map((value) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
    )
    .join(":");
}
export async function listEntries(query: {
  kind: DirectoryKind;
  search?: string;
  country?: string;
  region?: string;
  city?: string;
  discipline?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  history?: string;
  page?: number;
  limit?: number;
}) {
  const filters = [publicEligibility, sql`d.kind=${query.kind}`];
  if (query.search)
    filters.push(
      sql`(d.data->>'name' ILIKE ${`%${query.search}%`} OR d.data->>'description' ILIKE ${`%${query.search}%`})`
    );
  if (query.country)
    filters.push(
      sql`(lower(d.data->>'countryCode')=lower(${query.country}) OR lower(d.data->>'countryName')=lower(${query.country}))`
    );
  for (const key of ["region", "city"] as const)
    if (query[key])
      filters.push(sql`lower(d.data->>${key})=lower(${query[key]})`);
  if (query.discipline)
    filters.push(sql`d.data->'disciplines' ? ${query.discipline}`);
  if (query.eventType)
    filters.push(sql`d.data->>'eventType'=${query.eventType}`);
  if (query.startDate)
    filters.push(
      sql`COALESCE(d.data->>'endDate',d.data->>'startDate')>=${query.startDate}`
    );
  if (query.endDate) filters.push(sql`d.data->>'startDate'<=${query.endDate}`);
  if (query.kind === "event" && !query.startDate && !query.endDate)
    filters.push(
      query.history === "true"
        ? sql`COALESCE(d.data->>'endDate',d.data->>'startDate') < CURRENT_DATE::text`
        : sql`COALESCE(d.data->>'endDate',d.data->>'startDate') >= CURRENT_DATE::text`
    );
  const where = sql.join(filters, sql` AND `);
  const page = query.page ?? 1,
    limit = query.limit ?? 30;
  const count = await rows(
    sql`${publicDirectoryCte()} SELECT count(*)::int AS total FROM projected d WHERE ${where}`
  );
  const result = await rows(
    sql`${publicDirectoryCte()} SELECT d.* FROM projected d WHERE ${where} ORDER BY ${query.kind === "event" ? sql`d.data->>'startDate'` : sql`lower(d.data->>'name')`}, d.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`
  );
  const total = Number(count[0]?.total ?? 0);
  return {
    items: result.map(mapEntry),
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  };
}
export async function getEntry(
  id: string,
  publicOnly = true
): Promise<DirectoryEntry | null> {
  const parsedId = parseEntryId(id);
  if (!parsedId) return null;
  id = parsedId;
  const result = await rows(
    publicOnly
      ? sql`${publicDirectoryCte()} SELECT d.* FROM projected d WHERE (d.id=${id}::uuid OR d.academy_id=${id}::uuid OR d.event_id=${id}::uuid) AND ${publicEligibility} LIMIT 1`
      : sql`SELECT d.* FROM directory_entries d WHERE d.id=${id}::uuid LIMIT 1`
  );
  return result[0] ? mapEntry(result[0]) : null;
}
export async function audit(
  entryId: string | null,
  actorId: string | null,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await rows(
    sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${entryId}::uuid,${actorId}::uuid,${action},${JSON.stringify(metadata)}::jsonb)`
  );
}
export async function linkOperationalEntry(
  entryId: string,
  academyId: string,
  actorId: string,
  reason: string
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${entryId}`}))`
    );
    const entry = (
      await tx.execute(
        sql`SELECT * FROM directory_entries WHERE id=${entryId}::uuid FOR UPDATE`
      )
    ).rows[0];
    if (
      !entry ||
      entry.kind !== "academy" ||
      entry.merged_into ||
      entry.academy_id ||
      entry.event_id
    )
      throw new DirectoryError(
        "NOT_LINKABLE",
        "Esta ficha no puede vincularse",
        409
      );
    const academy = (
      await tx.execute(
        sql`SELECT a.id,a.country_code,p.user_id FROM academies a JOIN profiles p ON p.id=a.owner_id WHERE a.id=${academyId}::uuid AND p.can_login AND NOT p.is_suspended FOR UPDATE OF a`
      )
    ).rows[0];
    const grant = (
      await tx.execute(
        sql`SELECT user_id FROM directory_grants WHERE entry_id=${entryId}::uuid`
      )
    ).rows[0];
    if (!academy || !grant || academy.user_id !== grant.user_id)
      throw new DirectoryError(
        "OWNER_MISMATCH",
        "El representante verificado debe ser el propietario actual del espacio operativo",
        403
      );
    if (
      String(academy.country_code).toUpperCase() !==
      EntryDataSchema.parse(entry.data).countryCode
    )
      throw new DirectoryError(
        "COUNTRY_MISMATCH",
        "El país de la ficha y del espacio operativo deben coincidir",
        409
      );
    const previous = (
      await tx.execute(
        sql`SELECT id FROM directory_entries WHERE academy_id=${academyId}::uuid LIMIT 1`
      )
    ).rows;
    if (previous.length)
      throw new DirectoryError(
        "ALREADY_LINKED",
        "Ese espacio ya tiene una ficha vinculada; revisa los duplicados",
        409
      );
    await tx.execute(
      sql`UPDATE directory_entries SET academy_id=${academyId}::uuid,updated_at=now() WHERE id=${entryId}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${entryId}::uuid,${actorId}::uuid,'operational_linked',${JSON.stringify({ academyId, reason })}::jsonb)`
    );
    return { linked: true };
  });
}
export async function bulkPublication(
  ids: string[],
  publication: "published" | "withdrawn",
  actorId: string,
  reason: string,
  fingerprint?: string
) {
  const unique = [...new Set(ids)].sort();
  if (!unique.length || unique.length > 50)
    throw new DirectoryError("INVALID_BATCH", "Selecciona entre 1 y 50 fichas");
  return db.transaction(async (tx) => {
    const entries = (
      await tx.execute(
        sql`SELECT * FROM directory_entries WHERE id IN (${sql.join(
          unique.map((id) => sql`${id}::uuid`),
          sql`,`
        )}) ORDER BY id FOR UPDATE`
      )
    ).rows;
    if (entries.length !== unique.length)
      throw new DirectoryError(
        "NOT_FOUND",
        "Una ficha ya no está disponible",
        409
      );
    const preview = entries.map((e) => ({
      id: String(e.id),
      name: EntryDataSchema.parse(e.data).name,
      version: String(e.updated_at),
      issue:
        e.academy_id || e.event_id || e.merged_into
          ? "Gestiona esta ficha desde su espacio o destino de fusión"
          : publication === "published"
            ? publicationError(
                e.kind as DirectoryKind,
                EntryDataSchema.parse(e.data)
              )
            : null,
    }));
    const hash = createHash("sha256")
      .update(JSON.stringify({ publication, preview }))
      .digest("hex");
    if (!fingerprint) return { preview, fingerprint: hash, applied: false };
    if (fingerprint !== hash)
      throw new DirectoryError(
        "STALE_BATCH",
        "Las fichas cambiaron. Vuelve a previsualizar antes de confirmar",
        409
      );
    if (preview.some((e) => e.issue))
      throw new DirectoryError(
        "INCOMPLETE_BATCH",
        "Corrige las fichas indicadas antes de confirmar",
        409
      );
    for (const entry of entries) {
      await tx.execute(
        sql`UPDATE directory_entries SET publication=${publication},reviewed_at=CASE WHEN ${publication}='published' THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=${entry.id}::uuid`
      );
      await tx.execute(
        sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${entry.id}::uuid,${actorId}::uuid,'bulk_publication',${JSON.stringify({ publication, reason, fingerprint: hash })}::jsonb)`
      );
    }
    return { preview, fingerprint: hash, applied: true };
  });
}
export async function createEntry(
  kind: DirectoryKind,
  input: unknown,
  actorId: string
) {
  const data = EntryDataSchema.parse(input),
    id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO directory_entries(id,kind,data,slug) VALUES(${id}::uuid,${kind},${JSON.stringify(data)}::jsonb,${slugify(data.name)})`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action) VALUES(${id}::uuid,${actorId}::uuid,'created')`
    );
  });
  return getEntry(id, false);
}
export async function submitClaim(
  entryId: string,
  userId: string,
  relationship: string,
  evidence: string,
  evidencePath?: string
) {
  if (!(await getEntry(entryId)))
    throw new DirectoryError("NOT_FOUND", "Ficha no disponible", 404);
  if (
    evidencePath &&
    (!evidencePath.startsWith(`${userId}/`) ||
      !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(evidencePath))
  )
    throw new DirectoryError("INVALID_EVIDENCE", "Prueba no válida");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${entryId}`}))`
    );
    const entry = (
      await tx.execute(
        sql`SELECT * FROM directory_entries WHERE id=${entryId}::uuid FOR UPDATE`
      )
    ).rows[0] as Row;
    if (entry.academy_id || entry.event_id)
      throw new DirectoryError(
        "OPERATIONAL_ACCESS_REQUIRED",
        "Esta ficha ya pertenece a un espacio operativo. Solicita acceso a su administrador.",
        409
      );
    const grants = (
      await tx.execute(
        sql`SELECT user_id FROM directory_grants WHERE entry_id=${entryId}::uuid`
      )
    ).rows;
    const status = grants.length ? "disputed" : "pending";
    const result = await tx.execute(
      sql`INSERT INTO directory_claims(entry_id,user_id,relationship,evidence,evidence_path,status) VALUES(${entryId}::uuid,${userId}::uuid,${relationship},${evidence},${evidencePath ?? null},${status}) ON CONFLICT(entry_id,user_id) WHERE status IN ('pending','disputed') DO UPDATE SET relationship=EXCLUDED.relationship,evidence=EXCLUDED.evidence,evidence_path=EXCLUDED.evidence_path RETURNING id,status`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action) VALUES(${entryId}::uuid,${userId}::uuid,'claim_requested')`
    );
    return result.rows[0];
  });
}
export async function decideClaim(
  claimId: string,
  actorId: string,
  approve: boolean,
  decision: string,
  transfer = false
) {
  return db.transaction(async (tx) => {
    const claim = (
      await tx.execute(
        sql`SELECT * FROM directory_claims WHERE id=${claimId}::uuid`
      )
    ).rows[0] as Row | undefined;
    if (!claim)
      throw new DirectoryError("NOT_FOUND", "Solicitud no encontrada", 404);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${claim.entry_id}`}))`
    );
    const fresh = (
      await tx.execute(
        sql`SELECT status FROM directory_claims WHERE id=${claimId}::uuid FOR UPDATE`
      )
    ).rows[0] as Row;
    if (!["pending", "disputed"].includes(String(fresh.status)))
      throw new DirectoryError("ALREADY_DECIDED", "Solicitud ya resuelta", 409);
    const entry = (
      await tx.execute(
        sql`SELECT academy_id,event_id,publication,merged_into FROM directory_entries WHERE id=${claim.entry_id}::uuid FOR UPDATE`
      )
    ).rows[0] as Row;
    if (approve) {
      if (entry.publication !== "published" || entry.merged_into)
        throw new DirectoryError(
          "NOT_AVAILABLE",
          "La ficha ya no está disponible",
          409
        );
      const account = (
        await tx.execute(
          sql`SELECT 1 FROM auth.users u WHERE u.id=${claim.user_id}::uuid AND u.email_confirmed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=u.id AND (p.is_suspended OR NOT p.can_login))`
        )
      ).rows;
      if (!account.length)
        throw new DirectoryError(
          "ACCOUNT_DISABLED",
          "La cuenta no puede recibir permisos",
          409
        );
      if (entry.academy_id || entry.event_id)
        throw new DirectoryError(
          "OPERATIONAL_ACCESS_REQUIRED",
          "No se puede reclamar un espacio operativo mediante el directorio",
          409
        );
      const existing = (
        await tx.execute(
          sql`SELECT user_id FROM directory_grants WHERE entry_id=${claim.entry_id}::uuid`
        )
      ).rows;
      if (existing.length && !transfer)
        throw new DirectoryError(
          "ALREADY_CLAIMED",
          "Ya tiene representante. Resuelve la disputa o revoca primero el permiso.",
          409
        );
      if (existing.length && transfer) {
        await tx.execute(
          sql`DELETE FROM directory_grants WHERE entry_id=${claim.entry_id}::uuid`
        );
        await tx.execute(
          sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${claim.entry_id}::uuid,${actorId}::uuid,'grant_transferred',${JSON.stringify({ from: existing[0].user_id, to: claim.user_id, claimId, decision })}::jsonb)`
        );
      }
      await tx.execute(
        sql`INSERT INTO directory_grants(entry_id,user_id,approved_by) VALUES(${claim.entry_id}::uuid,${claim.user_id}::uuid,${actorId}::uuid)`
      );
      await tx.execute(
        sql`UPDATE directory_entries SET representation='verified',updated_at=now() WHERE id=${claim.entry_id}::uuid`
      );
    }
    await tx.execute(
      sql`UPDATE directory_claims SET status=${approve ? "approved" : "rejected"},decision=${decision},decided_by=${actorId}::uuid,decided_at=now() WHERE id=${claimId}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${claim.entry_id}::uuid,${actorId}::uuid,${approve ? "claim_approved" : "claim_rejected"},${JSON.stringify({ claimId, decision })}::jsonb)`
    );
    return { approved: approve };
  });
}
export async function editEntry(
  entryId: string,
  userId: string,
  input: unknown,
  admin = false
) {
  const data = EntryDataSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${entryId}`}))`
    );
    const result = (
      await tx.execute(
        sql`SELECT * FROM directory_entries WHERE id=${entryId}::uuid FOR UPDATE`
      )
    ).rows[0] as Row | undefined;
    if (!result || result.merged_into)
      throw new DirectoryError("NOT_FOUND", "Ficha no encontrada", 404);
    if (result.academy_id || result.event_id)
      throw new DirectoryError(
        "USE_WORKSPACE",
        "Edita la información desde el espacio operativo",
        409
      );
    if (!admin) {
      const access = (
        await tx.execute(
          sql`SELECT 1 FROM directory_grants WHERE entry_id=${entryId}::uuid AND user_id=${userId}::uuid`
        )
      ).rows;
      if (!access.length)
        throw new DirectoryError(
          "FORBIDDEN",
          "No puedes editar esta ficha",
          403
        );
      if (result.academy_id || result.event_id)
        throw new DirectoryError(
          "USE_WORKSPACE",
          "Edita la información pública desde el espacio operativo",
          409
        );
    }
    const needsReview =
      !admin && requiresReview(result.data as EntryData, data);
    if (needsReview) {
      const revision = await tx.execute(
        sql`INSERT INTO directory_revisions(entry_id,user_id,kind,data,base_version) VALUES(${entryId}::uuid,${userId}::uuid,'edit',${JSON.stringify(data)}::jsonb,${result.updated_at}::timestamptz) RETURNING id`
      );
      return { pending: true, revisionId: revision.rows[0].id };
    }
    const invalid =
      result.publication === "published"
        ? publicationError(result.kind as DirectoryKind, data)
        : null;
    if (invalid) throw new DirectoryError("INCOMPLETE", invalid);
    await tx.execute(
      sql`UPDATE directory_entries SET data=${JSON.stringify(data)}::jsonb,slug=${slugify(data.name)},updated_at=now() WHERE id=${entryId}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action) VALUES(${entryId}::uuid,${userId}::uuid,'edited')`
    );
    return { pending: false };
  });
}
export async function setPublication(
  entryId: string,
  actorId: string,
  publication: string
) {
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(
        sql`SELECT * FROM directory_entries WHERE id=${entryId}::uuid FOR UPDATE`
      )
    ).rows[0] as Row | undefined;
    if (!row) throw new DirectoryError("NOT_FOUND", "Ficha no encontrada", 404);
    if (row.merged_into)
      throw new DirectoryError("MERGED", "La ficha se ha fusionado", 409);
    if (publication === "published") {
      const error = publicationError(
        row.kind as DirectoryKind,
        EntryDataSchema.parse(row.data)
      );
      if (error) throw new DirectoryError("INCOMPLETE", error);
    }
    await tx.execute(
      sql`UPDATE directory_entries SET publication=${publication},reviewed_at=CASE WHEN ${publication}='published' THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=${entryId}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${entryId}::uuid,${actorId}::uuid,'publication_changed',${JSON.stringify({ publication })}::jsonb)`
    );
    return { publication };
  });
}
export async function revokeGrant(
  entryId: string,
  actorId: string,
  reason: string
) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${entryId}`}))`
    );
    await tx.execute(
      sql`DELETE FROM directory_grants WHERE entry_id=${entryId}::uuid`
    );
    await tx.execute(
      sql`UPDATE directory_entries SET representation='unclaimed',updated_at=now() WHERE id=${entryId}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${entryId}::uuid,${actorId}::uuid,'grant_revoked',${JSON.stringify({ reason })}::jsonb)`
    );
  });
  return { revoked: true };
}
export async function decideRevision(
  id: string,
  actorId: string,
  approve: boolean,
  decision: string
) {
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(
        sql`SELECT * FROM directory_revisions WHERE id=${id}::uuid FOR UPDATE`
      )
    ).rows[0] as Row | undefined;
    if (!row || row.status !== "pending")
      throw new DirectoryError("NOT_PENDING", "Propuesta no disponible", 409);
    if (approve && row.kind === "proposal") {
      const proposed = EntryInputSchema.parse(row.data),
        entryId = randomUUID();
      await tx.execute(
        sql`INSERT INTO directory_entries(id,kind,data,slug) VALUES(${entryId}::uuid,${proposed.kind},${JSON.stringify(proposed.data)}::jsonb,${slugify(proposed.data.name)})`
      );
      row.entry_id = entryId;
      await tx.execute(
        sql`UPDATE directory_revisions SET entry_id=${entryId}::uuid WHERE id=${id}::uuid`
      );
    }
    if (approve && row.kind === "correction") {
      const edited = (
        await tx.execute(
          sql`SELECT 1 FROM directory_audit WHERE entry_id=${row.entry_id}::uuid AND action='edited' AND actor_id=${actorId}::uuid AND created_at>${row.created_at}::timestamptz LIMIT 1`
        )
      ).rows;
      if (!edited.length)
        throw new DirectoryError(
          "EDIT_REQUIRED",
          "Edita y contrasta primero la ficha; después podrás resolver esta corrección",
          409
        );
    }
    if (approve && row.entry_id && row.kind !== "proposal") {
      const entry = (
        await tx.execute(
          sql`SELECT * FROM directory_entries WHERE id=${row.entry_id}::uuid FOR UPDATE`
        )
      ).rows[0] as Row;
      if (
        row.base_version &&
        new Date(String(row.base_version)).getTime() !==
          new Date(String(entry.updated_at)).getTime()
      )
        throw new DirectoryError(
          "STALE_REVISION",
          "La ficha cambió; revisa la versión actual",
          409
        );
      if (entry.academy_id || entry.event_id)
        throw new DirectoryError(
          "USE_WORKSPACE",
          "Gestiona los cambios desde el espacio operativo",
          409
        );
      if (row.kind === "edit") {
        const active = (
          await tx.execute(
            sql`SELECT 1 FROM directory_grants WHERE entry_id=${row.entry_id}::uuid AND user_id=${row.user_id}::uuid`
          )
        ).rows;
        if (!active.length)
          throw new DirectoryError(
            "GRANT_REVOKED",
            "El permiso del solicitante fue revocado",
            409
          );
      }
      if (row.kind === "removal")
        await tx.execute(
          sql`UPDATE directory_entries SET publication='withdrawn',updated_at=now() WHERE id=${row.entry_id}::uuid`
        );
      else if (row.kind === "edit" || row.kind === "import") {
        const data = EntryDataSchema.parse(row.data);
        const error =
          entry.publication === "published"
            ? publicationError(entry.kind as DirectoryKind, data)
            : null;
        if (error) throw new DirectoryError("INCOMPLETE", error);
        await tx.execute(
          sql`UPDATE directory_entries SET data=${JSON.stringify(data)}::jsonb,slug=${slugify(data.name)},reviewed_at=now(),updated_at=now() WHERE id=${row.entry_id}::uuid`
        );
      }
    }
    await tx.execute(
      sql`UPDATE directory_revisions SET status=${approve ? "approved" : "rejected"},decision=${decision},decided_at=now() WHERE id=${id}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${row.entry_id}::uuid,${actorId}::uuid,'revision_decided',${JSON.stringify({ id, approve, decision })}::jsonb)`
    );
    return { approved: approve };
  });
}
export async function myDirectory(userId: string) {
  const entries = await rows(
    sql`SELECT d.* FROM directory_entries d JOIN directory_grants g ON g.entry_id=d.id WHERE g.user_id=${userId}::uuid ORDER BY d.updated_at DESC LIMIT 100`
  );
  const claims = await rows(
    sql`SELECT c.id,c.entry_id,c.status,c.relationship,c.decision,c.created_at,d.data->>'name' AS name FROM directory_claims c JOIN directory_entries d ON d.id=c.entry_id WHERE c.user_id=${userId}::uuid ORDER BY c.created_at DESC LIMIT 100`
  );
  const favorites = await rows(
    sql`${publicDirectoryCte()} SELECT d.* FROM projected d JOIN directory_favorites f ON f.entry_id=d.id WHERE f.user_id=${userId}::uuid AND ${publicEligibility} ORDER BY f.created_at DESC LIMIT 100`
  );
  const revisions = await rows(
    sql`SELECT id,entry_id,status,decision FROM directory_revisions WHERE user_id=${userId}::uuid ORDER BY created_at DESC LIMIT 100`
  );
  return {
    entries: entries.map(mapEntry),
    claims,
    favorites: favorites.map(mapEntry),
    revisions,
  };
}
export async function mergeEntries(from: string, to: string, actor: string) {
  if (from === to)
    throw new DirectoryError("INVALID_MERGE", "Elige fichas diferentes");
  return db.transaction(async (tx) => {
    // Sorted entry locks prevent deadlocks for simultaneous opposite merges.
    for (const id of [from, to].sort())
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${id}`}))`
      );
    const result = (
      await tx.execute(
        sql`SELECT * FROM directory_entries WHERE id IN (${from}::uuid,${to}::uuid) ORDER BY id FOR UPDATE`
      )
    ).rows as Row[];
    const a = result.find((r) => r.id === from),
      b = result.find((r) => r.id === to);
    if (
      !a ||
      !b ||
      a.kind !== b.kind ||
      a.merged_into ||
      b.merged_into ||
      a.academy_id ||
      b.academy_id ||
      a.event_id ||
      b.event_id
    )
      throw new DirectoryError(
        "INVALID_MERGE",
        "Solo se pueden fusionar fichas externas del mismo tipo",
        409
      );
    const grants = (
      await tx.execute(
        sql`SELECT * FROM directory_grants WHERE entry_id IN (${from}::uuid,${to}::uuid)`
      )
    ).rows;
    if (grants.length)
      throw new DirectoryError(
        "VERIFIED_MERGE",
        "Resuelve los permisos de representación antes de fusionar",
        409
      );
    await tx.execute(
      sql`UPDATE directory_entries SET merged_into=${to}::uuid,publication='withdrawn',updated_at=now() WHERE id=${from}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_favorites(user_id,entry_id) SELECT user_id,${to}::uuid FROM directory_favorites WHERE entry_id=${from}::uuid ON CONFLICT DO NOTHING`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${from}::uuid,${actor}::uuid,'merged',${JSON.stringify({ to })}::jsonb)`
    );
    return { redirect: entryPath(mapEntry(b)) };
  });
}

export async function materializeOperationalEntry(id: string) {
  await rows(
    sql`${publicDirectoryCte()} INSERT INTO directory_entries(id,kind,data,slug,publication,academy_id,event_id,reviewed_at) SELECT id,kind,data,slug,publication,academy_id,event_id,reviewed_at FROM projected WHERE id=${id}::uuid AND (academy_id IS NOT NULL OR event_id IS NOT NULL) ON CONFLICT DO NOTHING`
  );
}
export async function syncOperationalDirectory() {
  return rows(
    sql`${publicDirectoryCte()} INSERT INTO directory_entries(id,kind,data,slug,publication,academy_id,event_id,reviewed_at) SELECT id,kind,data,slug,publication,academy_id,event_id,reviewed_at FROM projected WHERE (academy_id IS NOT NULL OR event_id IS NOT NULL) AND publication='published' ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data WHERE directory_entries.data IS DISTINCT FROM EXCLUDED.data RETURNING id`
  );
}

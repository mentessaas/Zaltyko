import { officialCandidates } from "./adapters";
import { fetchApprovedSource } from "./source-fetch";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rows, DirectoryError } from "./service";
import { EntryInputSchema, EntryDataSchema, slugify } from "./contracts";
export const CandidateSchema = EntryInputSchema.extend({
  evidence: z
    .object({
      excerpt: z.string().max(500),
      pageHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
  externalId: z.string().trim().min(1).max(500),
});
export function parseCandidates(
  content: string,
  format: "json" | "csv"
): unknown[] {
  if (Buffer.byteLength(content, "utf8") > 2000000)
    throw new DirectoryError("IMPORT_TOO_LARGE", "El archivo supera 2 MB");
  const result =
    format === "json"
      ? JSON.parse(content)
      : (parse(content, {
          columns: true,
          skip_empty_lines: true,
          bom: true,
          max_record_size: 20000,
        }) as Record<string, string>[]);
  if (!Array.isArray(result) || result.length > 1000)
    throw new DirectoryError(
      "INVALID_IMPORT",
      "Utiliza una lista con un máximo de 1000 filas"
    );
  return format === "json"
    ? result
    : result.map((r: Record<string, string>) => ({
        externalId: r.externalId,
        kind: r.kind,
        data: {
          name: r.name,
          description: r.description ?? "",
          countryCode: r.countryCode,
          city: r.city || null,
          region: r.region || null,
          address: r.address || null,
          disciplines: r.disciplines ? r.disciplines.split("|") : [],
          sourceUrl: r.sourceUrl,
          sourceName: r.sourceName,
          website: r.website || null,
          startDate: r.startDate || null,
          endDate: r.endDate || null,
          organizerName: r.organizerName || null,
          registrationUrl: r.registrationUrl || null,
        },
      }));
}
export async function importCandidates(
  sourceId: string,
  content: string,
  format: "json" | "csv"
) {
  const source = (
    await rows(sql`SELECT id FROM directory_sources WHERE id=${sourceId}::uuid`)
  )[0];
  if (!source)
    throw new DirectoryError(
      "SOURCE_NOT_FOUND",
      "Registra primero la fuente",
      404
    );
  const candidates = parseCandidates(content, format),
    fingerprint = createHash("sha256").update(content).digest("hex");
  return db.transaction(async (tx) => {
    const batch = (
      await tx.execute(
        sql`INSERT INTO directory_batches(source_id,fingerprint) VALUES(${sourceId}::uuid,${fingerprint}) ON CONFLICT(source_id,fingerprint) DO NOTHING RETURNING id`
      )
    ).rows[0];
    if (!batch) {
      const prior = (
        await tx.execute(
          sql`SELECT id,summary FROM directory_batches WHERE source_id=${sourceId}::uuid AND fingerprint=${fingerprint}`
        )
      ).rows[0];
      return { ...prior, repeated: true };
    }
    let valid = 0,
      invalid = 0;
    const seen = new Set<string>();
    for (let index = 0; index < candidates.length; index++) {
      const parsed = CandidateSchema.safeParse(candidates[index]);
      const externalId = parsed.success
        ? parsed.data.externalId
        : `invalid-row:${index}`;
      const duplicate = seen.has(externalId);
      seen.add(externalId);
      const error = duplicate
        ? "Identificador de fuente repetido"
        : parsed.success
          ? null
          : parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
              .slice(0, 2000);
      if (error) invalid++;
      else valid++;
      // Never persist arbitrary uploaded fields (CRM contacts or athlete names).
      const candidate = parsed.success ? parsed.data : { row: index + 1 };
      await tx.execute(
        sql`INSERT INTO directory_import_rows(batch_id,source_id,external_id,candidate,error,status) VALUES(${batch.id}::uuid,${sourceId}::uuid,${duplicate ? `${externalId}:duplicate:${index}` : externalId},${JSON.stringify(candidate)}::jsonb,${error},${error ? "invalid" : "pending"})`
      );
    }
    const summary = { valid, invalid, total: candidates.length };
    await tx.execute(
      sql`UPDATE directory_batches SET summary=${JSON.stringify(summary)}::jsonb WHERE id=${batch.id}::uuid`
    );
    return { id: batch.id, summary, repeated: false };
  });
}
export async function acceptImportRow(
  id: string,
  actorId: string,
  targetId?: string
) {
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(
        sql`SELECT r.*,s.enabled,s."authorization" FROM directory_import_rows r JOIN directory_sources s ON s.id=r.source_id WHERE r.id=${id}::uuid `
      )
    ).rows[0];
    if (!row || row.error)
      throw new DirectoryError("INVALID_ROW", "Fila no disponible", 409);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory-import:${row.source_id}:${row.external_id}`}))`
    );
    const fresh = (
      await tx.execute(
        sql`SELECT status,entry_id FROM directory_import_rows WHERE id=${id}::uuid FOR UPDATE`
      )
    ).rows[0];
    row.status = fresh.status;
    row.entry_id = fresh.entry_id;
    if (row.status !== "pending")
      return { entryId: row.entry_id, repeated: true };
    if (!row.enabled || !row.authorization)
      throw new DirectoryError(
        "SOURCE_PERMISSION_REQUIRED",
        "Documenta y activa la fuente antes de aceptar sus datos",
        403
      );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`directory-import:${row.source_id}:${row.external_id}`}))`
    );
    const candidate = CandidateSchema.parse(row.candidate);
    const previous = (
      await tx.execute(
        sql`SELECT entry_id FROM directory_import_rows WHERE source_id=${row.source_id}::uuid AND external_id=${row.external_id} AND entry_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    if (targetId && previous?.entry_id && targetId !== previous.entry_id)
      throw new DirectoryError(
        "SOURCE_ALREADY_LINKED",
        "La referencia ya está vinculada a otra ficha",
        409
      );
    let entryId = previous?.entry_id ?? targetId;
    if (entryId) {
      const entry = (
        await tx.execute(
          sql`SELECT * FROM directory_entries WHERE id=${entryId}::uuid FOR UPDATE`
        )
      ).rows[0];
      if (
        !entry ||
        entry.merged_into ||
        entry.kind !== candidate.kind ||
        EntryInputSchema.parse({ kind: entry.kind, data: entry.data }).data
          .countryCode !== candidate.data.countryCode
      )
        throw new DirectoryError(
          "MERGED_SOURCE",
          "La referencia se fusionó; revisa el destino",
          409
        );
      await tx.execute(
        sql`INSERT INTO directory_revisions(entry_id,user_id,kind,data,base_version) VALUES(${entryId}::uuid,${actorId}::uuid,'import',${JSON.stringify(candidate.data)}::jsonb,${entry.updated_at}::timestamptz)`
      );
    } else {
      const possible = (
        await tx.execute(
          sql`SELECT id FROM directory_entries WHERE kind=${candidate.kind} AND lower(data->>'name')=lower(${candidate.data.name}) AND data->>'countryCode'=${candidate.data.countryCode} AND lower(COALESCE(data->>'city',''))=lower(${candidate.data.city ?? ""}) AND merged_into IS NULL LIMIT 10`
        )
      ).rows;
      if (possible.length)
        throw new DirectoryError(
          "POSSIBLE_DUPLICATE",
          "Existe una ficha parecida. Revisa y vincula la referencia de fuente antes de continuar",
          409
        );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`directory-duplicate:${candidate.kind}:${candidate.data.countryCode}:${candidate.data.name.toLowerCase()}:${(candidate.data.city ?? "").toLowerCase()}`}))`
      );
      const duplicate = (
        await tx.execute(
          sql`SELECT id FROM directory_entries WHERE kind=${candidate.kind} AND lower(data->>'name')=lower(${candidate.data.name}) AND data->>'countryCode'=${candidate.data.countryCode} AND lower(COALESCE(data->>'city',''))=lower(${candidate.data.city ?? ""}) AND merged_into IS NULL LIMIT 1`
        )
      ).rows;
      if (duplicate.length)
        throw new DirectoryError(
          "POSSIBLE_DUPLICATE",
          "Ficha parecida creada por otro lote; revisa antes de continuar",
          409
        );
      entryId = randomUUID();
      await tx.execute(
        sql`INSERT INTO directory_entries(id,kind,data,slug) VALUES(${entryId}::uuid,${candidate.kind},${JSON.stringify(candidate.data)}::jsonb,${slugify(candidate.data.name)})`
      );
    }
    await tx.execute(
      sql`UPDATE directory_import_rows SET entry_id=${entryId}::uuid,status='accepted' WHERE id=${id}::uuid`
    );
    await tx.execute(
      sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${entryId}::uuid,${actorId}::uuid,'import_accepted',${JSON.stringify({ rowId: id })}::jsonb)`
    );
    return { entryId };
  });
}
const sourceHosts = {
  rfeg: ["rfegimnasia.es"],
  fdpg: ["www.federaciongimnasia.com", "federaciongimnasia.com"],
  cbg: ["cbginastica.com.br", "www.cbginastica.com.br"],
} as const;
export function allowedSourceUrl(raw: string, adapter: string) {
  const hosts = sourceHosts[adapter as keyof typeof sourceHosts];
  const u = new URL(raw);
  if (
    !hosts ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && !["443"].includes(u.port)) ||
    !hosts.some((h) => h === u.hostname)
  )
    throw new DirectoryError(
      "SOURCE_NOT_ALLOWED",
      "Dominio de fuente no autorizado",
      403
    );
  return u;
}
export function structuredEvents(
  html: string,
  source: { url: string; name: string; country_code: string }
) {
  const candidates: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let json: unknown;
    try {
      json = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(json)
      ? json
      : json && typeof json === "object" && "@graph" in json
        ? (json as { "@graph": unknown[] })["@graph"]
        : [json];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;
      if (n["@type"] !== "Event") continue;
      const location = n.location as
        | {
            name?: string;
            address?: {
              addressLocality?: string;
              addressRegion?: string;
              addressCountry?: string;
            };
          }
        | undefined;
      const organizer = n.organizer as
        { name?: string; url?: string } | undefined;
      const candidate = {
        externalId: String(
          n["@id"] ??
            n.url ??
            createHash("sha256")
              .update(`${n.name}|${n.startDate}|${location?.name}`)
              .digest("hex")
        ),
        kind: "event",
        data: {
          name: n.name,
          description:
            typeof n.description === "string"
              ? n.description.replace(/<[^>]+>/g, "")
              : "",
          countryCode: location?.address?.addressCountry ?? source.country_code,
          city: location?.address?.addressLocality ?? null,
          region: location?.address?.addressRegion ?? null,
          venue: location?.name ?? null,
          sourceUrl: source.url,
          sourceName: source.name,
          startDate:
            typeof n.startDate === "string" ? n.startDate.slice(0, 10) : null,
          endDate:
            typeof n.endDate === "string" ? n.endDate.slice(0, 10) : null,
          organizerName: organizer?.name ?? null,
          eventStatus: "provisional",
        },
      };
      if (CandidateSchema.safeParse(candidate).success)
        candidates.push(candidate);
    }
  }
  return candidates;
}
export async function fetchSourceCandidates(sourceId: string) {
  const source = (
    await rows(sql`SELECT * FROM directory_sources WHERE id=${sourceId}::uuid`)
  )[0];
  if (!source || !source.enabled || !source.authorization)
    throw new DirectoryError(
      "SOURCE_PERMISSION_REQUIRED",
      "Fuente no habilitada",
      403
    );
  const url = allowedSourceUrl(String(source.url), String(source.adapter));
  const html = await fetchApprovedSource(url);
  const extracted = officialCandidates(html, {
    url: String(source.url),
    name: String(source.name),
    country_code: String(source.country_code),
    adapter: String(source.adapter),
  });
  const candidates = [
    ...structuredEvents(html, {
      url: String(source.url),
      name: String(source.name),
      country_code: String(source.country_code),
    }),
    ...extracted.candidates,
  ];
  await rows(
    sql`UPDATE directory_sources SET last_result=${JSON.stringify({ resources: extracted.resources, candidates: candidates.length })}::jsonb,checked_at=now(),last_error=NULL WHERE id=${sourceId}::uuid`
  );
  if (!candidates.length) {
    if (extracted.resources.length)
      return { resources: extracted.resources, manualExtractionRequired: true };
    throw new DirectoryError(
      "MANUAL_EXTRACTION_REQUIRED",
      "La fuente no ofrece datos extraíbles fiables; prepara candidatos revisados manualmente",
      422
    );
  }
  const result = await importCandidates(
    sourceId,
    JSON.stringify(candidates),
    "json"
  );
  await rows(
    sql`UPDATE directory_sources SET checked_at=now(),last_error=NULL WHERE id=${sourceId}::uuid`
  );
  return result;
}

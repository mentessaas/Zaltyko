import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  createEntry,
  setPublication,
  submitClaim,
  decideClaim,
  editEntry,
  getEntry,
  listEntries,
  academyDuplicateQuery,
  academyDuplicateLock,
  academyOperationalIdentityQuery,
  rows,
  decideRevision,
  revokeGrant,
  materializeOperationalEntry,
  mergeEntries,
  bulkPublication,
  linkOperationalEntry,
  DirectoryError,
} from "../../src/lib/directory/service";
import {
  importCandidates,
  acceptImportRow,
} from "../../src/lib/directory/imports";
import {
  requestSubscription,
  confirmSubscription,
  confirmationToken,
  hasPositiveMarketingConsent,
  withdrawSubscription,
  unsubscribeToken,
  processDeliveries,
  enqueueDigests,
  retryDelivery,
} from "../../src/lib/directory/communications";
import { calendarFile } from "../../src/lib/directory/calendar";
const connection = process.env.DATABASE_URL_POOL!;
if (
  new URL(connection).hostname !== "127.0.0.1" ||
  new URL(connection).port !== "55449"
)
  throw new Error("Tests only run on the isolated local cluster at port 55449");
const pool = new Pool({ connectionString: connection });
const query = (s: string, p: unknown[] = []) => pool.query(s, p);
const admin = randomUUID(),
  one = randomUUID(),
  two = randomUUID();
let checks = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
}
async function rejects(
  name: string,
  run: () => Promise<unknown>,
  code: string
) {
  await assert.rejects(run, (e: unknown) =>
    Boolean(e && typeof e === "object" && "code" in e && e.code === code)
  );
  check(name, true);
}
async function waitForLockWait(timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await query(
      "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock') AS waiting"
    );
    if (result.rows[0]?.waiting) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  return false;
}
async function createAuthorizedSource(name: string, url: string) {
  const details = {
    sourceName: name,
    sourceUrl: url,
    countryCode: "PE",
    adapter: "manual",
    termsUrl: "https://example.org/terms",
    authorizationReference: "Permiso escrito de fixture QA expediente TEST-02",
  };
  const sourceId = (
    await query(
      `INSERT INTO directory_sources(name,url,country_code,terms_url,"authorization",adapter,enabled) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [
        details.sourceName,
        details.sourceUrl,
        details.countryCode,
        details.termsUrl,
        details.authorizationReference,
        details.adapter,
      ]
    )
  ).rows[0].id;
  await query(
    `INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(NULL,$1,'source_authorization_confirmed',$2::jsonb)`,
    [admin, JSON.stringify({ sourceId, ...details })]
  );
  return String(sourceId);
}
async function main() {
  for (const id of [admin, one, two])
    await query(
      "INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now())",
      [id]
    );
  const data = {
    name: "Academia ficticia de prueba",
    countryCode: "ES",
    region: "Comunidad de Madrid",
    city: "Madrid",
    sourceName: "Fuente ficticia QA",
    sourceUrl: "https://example.org/qa",
  };
  const before = await query(
    "SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM academies) academies,(SELECT count(*) FROM memberships) memberships"
  );
  const entry = (await createEntry("academy", data, admin))!;
  await setPublication(entry.id, admin, "published");
  const after = await query(
    "SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM academies) academies,(SELECT count(*) FROM memberships) memberships"
  );
  check(
    "Publicar academia externa no crea Auth, propietario, membership ni espacio operativo",
    JSON.stringify(before.rows) === JSON.stringify(after.rows)
  );
  const drafts = (await createEntry(
    "academy",
    { ...data, name: "Borrador privado" },
    admin
  ))!;
  check(
    "Borradores ocultos en lectores públicos",
    (await getEntry(drafts.id)) === null
  );
  const exactMatches = await rows(
    academyDuplicateQuery({
      name: "  ACADEMIA ficticia de prueba  ",
      countryCode: "es",
      city: "Madrid",
    })
  );
  check(
    "Onboarding detecta la ficha exacta sin depender del correo",
    exactMatches.length === 1 && exactMatches[0].id === entry.id
  );
  check(
    "Activar una ficha no se confunde con la propia ficha reclamada",
    (await rows(academyDuplicateQuery({ ...data, excludeEntryId: entry.id })))
      .length === 0
  );
  check(
    "Otra sede con el mismo nombre no se fusiona ni bloquea",
    (await rows(academyDuplicateQuery({ ...data, city: "Lima" }))).length === 0
  );
  check(
    "Otra región con el mismo nombre y ciudad no se confunde con la ficha",
    (await rows(academyDuplicateQuery({ ...data, region: "Andalucía" })))
      .length === 0
  );
  check(
    "La búsqueda de duplicados no revela borradores",
    (await rows(academyDuplicateQuery({ ...data, name: "Borrador privado" })))
      .length === 0
  );
  check(
    "Creaciones del mismo nombre y país comparten bloqueo aunque cambie la localidad",
    academyDuplicateLock({ ...data, city: "Madrid" }) ===
      academyDuplicateLock({ ...data, city: "Lima" })
  );
  const accentEntry = (await createEntry(
    "academy",
    { ...data, name: "Club Córdoba", region: "Andalucía", city: "Córdoba" },
    admin
  ))!;
  await setPublication(accentEntry.id, admin, "published");
  check(
    "La búsqueda y el bloqueo reconocen diferencias solo de tildes",
    (
      await rows(
        academyDuplicateQuery({
          name: "club cordoba",
          countryCode: "es",
          region: "andalucia",
          city: "cordoba",
        })
      )
    ).some((candidate) => candidate.id === accentEntry.id) &&
      academyDuplicateLock({ name: "Club Córdoba", countryCode: "ES" }) ===
        academyDuplicateLock({ name: "club cordoba", countryCode: "es" })
  );
  const claims = await Promise.all([
    submitClaim(
      entry.id,
      one,
      "Directora de prueba",
      "Confirmación institucional ficticia de prueba"
    ),
    submitClaim(
      entry.id,
      one,
      "Directora de prueba",
      "Confirmación institucional ficticia de prueba"
    ),
  ]);
  check("Doble envío es idempotente", claims[0].id === claims[1].id);
  const rival = await submitClaim(
    entry.id,
    two,
    "Director de prueba",
    "Confirmación institucional ficticia de prueba"
  );
  await rejects(
    "Solicitar no concede edición",
    () => editEntry(entry.id, one, { ...data, description: "Sin permiso" }),
    "FORBIDDEN"
  );
  const approvals = await Promise.allSettled([
    decideClaim(String(claims[0].id), admin, true, "Prueba contrastada en QA"),
    decideClaim(String(rival.id), admin, true, "Prueba contrastada en QA"),
  ]);
  check(
    "Dos aprobaciones simultáneas conceden un solo permiso",
    approvals.filter((r) => r.status === "fulfilled").length === 1
  );
  const owner = (
      await query("SELECT user_id FROM directory_grants WHERE entry_id=$1", [
        entry.id,
      ])
    ).rows[0].user_id as string,
    other = owner === one ? two : one;
  await rejects(
    "Usuario ajeno no edita otra ficha",
    () => editEntry(entry.id, other, data),
    "FORBIDDEN"
  );
  await editEntry(entry.id, owner, {
    ...data,
    description: "Cambio rutinario permitido",
  });
  check(
    "Cambio rutinario publicado sin elevar rol",
    (await getEntry(entry.id))?.data.description ===
      "Cambio rutinario permitido"
  );
  const revision = await editEntry(entry.id, owner, {
    ...data,
    name: "Identidad nueva pendiente",
    description: "Cambio rutinario permitido",
  });
  check(
    "Cambio sensible conserva versión aprobada",
    revision.pending && (await getEntry(entry.id))?.data.name === data.name
  );
  await decideRevision(
    String(revision.revisionId),
    admin,
    true,
    "Cambio contrastado"
  );
  check(
    "Moderación publica la identidad nueva",
    (await getEntry(entry.id))?.data.name === "Identidad nueva pendiente"
  );
  await revokeGrant(entry.id, admin, "Revocación de prueba");
  await rejects(
    "Revocación retira edición y conserva publicación",
    () => editEntry(entry.id, owner, data),
    "FORBIDDEN"
  );
  check(
    "Ficha permanece pública después de revocar",
    Boolean(await getEntry(entry.id))
  );
  const sourceDetails = {
    sourceName: "Fuente QA",
    sourceUrl: "https://example.org/feed",
    countryCode: "PE",
    adapter: "manual",
    termsUrl: "https://example.org/terms",
    authorizationReference: "Permiso ficticio de fixture QA expediente TEST-01",
  };
  const source = (
    await query(
      `INSERT INTO directory_sources(name,url,country_code,terms_url,"authorization",adapter,enabled) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [
        sourceDetails.sourceName,
        sourceDetails.sourceUrl,
        sourceDetails.countryCode,
        sourceDetails.termsUrl,
        sourceDetails.authorizationReference,
        sourceDetails.adapter,
      ]
    )
  ).rows[0].id;
  await query(
    `INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(NULL,$1,'source_authorization_confirmed',$2::jsonb)`,
    [admin, JSON.stringify({ sourceId: source, ...sourceDetails })]
  );
  const candidate = {
    externalId: "source-001",
    kind: "academy",
    data: {
      ...data,
      name: "Academia importada ficticia",
      countryCode: "PE",
      city: "Lima",
    },
  };
  const unapprovedSource = (
    await query(
      "INSERT INTO directory_sources(name,url,country_code,enabled) VALUES('Fuente sin permiso QA','https://example.org/unapproved','PE',false) RETURNING id"
    )
  ).rows[0].id;
  await rejects(
    "No importar desde fuente sin permiso confirmado",
    () =>
      importCandidates(
        String(unapprovedSource),
        JSON.stringify([candidate]),
        "json"
      ),
    "SOURCE_PERMISSION_REQUIRED"
  );
  const staleSourceDetails = {
    ...sourceDetails,
    sourceName: "Fuente con permiso antiguo QA",
    sourceUrl: "https://example.org/stale",
  };
  const staleSource = (
    await query(
      `INSERT INTO directory_sources(name,url,country_code,terms_url,"authorization",adapter,enabled) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [
        staleSourceDetails.sourceName,
        staleSourceDetails.sourceUrl,
        staleSourceDetails.countryCode,
        staleSourceDetails.termsUrl,
        staleSourceDetails.authorizationReference,
        staleSourceDetails.adapter,
      ]
    )
  ).rows[0].id;
  await query(
    `INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(NULL,$1,'source_authorization_confirmed',$2::jsonb)`,
    [admin, JSON.stringify({ sourceId: staleSource, ...staleSourceDetails })]
  );
  await query(
    "UPDATE directory_sources SET terms_url='https://example.org/revised-terms' WHERE id=$1",
    [staleSource]
  );
  await rejects(
    "No importar tras cambiar las condiciones sin reconfirmar",
    () =>
      importCandidates(
        String(staleSource),
        JSON.stringify([candidate]),
        "json"
      ),
    "SOURCE_PERMISSION_REQUIRED"
  );
  const importRaceSource = await createAuthorizedSource(
    "Fuente concurrente import",
    "https://example.org/concurrent-import"
  );
  const importRevocation = await pool.connect();
  await importRevocation.query("BEGIN");
  await importRevocation.query(
    "UPDATE directory_sources SET enabled=false WHERE id=$1",
    [importRaceSource]
  );
  const importDuringRevocation = importCandidates(
    importRaceSource,
    JSON.stringify([{ ...candidate, externalId: "concurrent-import" }]),
    "json"
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  const importWaitedForSourceLock = await waitForLockWait();
  await importRevocation.query("COMMIT");
  importRevocation.release();
  const importDuringRevocationResult = await importDuringRevocation;
  check(
    "Importación espera a que termine la revocación concurrente",
    importWaitedForSourceLock
  );
  check(
    "Importación rechaza una fuente revocada durante la operación",
    !importDuringRevocationResult.ok &&
      importDuringRevocationResult.error instanceof DirectoryError &&
      importDuringRevocationResult.error.code === "SOURCE_PERMISSION_REQUIRED"
  );

  const acceptRaceSource = await createAuthorizedSource(
    "Fuente concurrente aceptación",
    "https://example.org/concurrent-accept"
  );
  const acceptRaceBatch = await importCandidates(
    acceptRaceSource,
    JSON.stringify([{ ...candidate, externalId: "concurrent-accept" }]),
    "json"
  );
  const acceptRaceRow = (
    await query("SELECT id FROM directory_import_rows WHERE batch_id=$1", [
      acceptRaceBatch.id,
    ])
  ).rows[0].id;
  const acceptRevocation = await pool.connect();
  await acceptRevocation.query("BEGIN");
  await acceptRevocation.query(
    "UPDATE directory_sources SET enabled=false WHERE id=$1",
    [acceptRaceSource]
  );
  const acceptDuringRevocation = acceptImportRow(
    String(acceptRaceRow),
    admin
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  const acceptWaitedForSourceLock = await waitForLockWait();
  await acceptRevocation.query("COMMIT");
  acceptRevocation.release();
  const acceptDuringRevocationResult = await acceptDuringRevocation;
  check(
    "Aceptación espera a que termine la revocación concurrente",
    acceptWaitedForSourceLock
  );
  check(
    "No se acepta una fila después de revocar su fuente",
    !acceptDuringRevocationResult.ok &&
      acceptDuringRevocationResult.error instanceof DirectoryError &&
      acceptDuringRevocationResult.error.code === "SOURCE_PERMISSION_REQUIRED"
  );
  const batch = await importCandidates(
      source,
      JSON.stringify([candidate]),
      "json"
    ),
    repeat = await importCandidates(
      source,
      JSON.stringify([candidate]),
      "json"
    );
  check(
    "Reimportar lote no duplica registros",
    batch.id === repeat.id && repeat.repeated === true
  );
  const row = (
    await query("SELECT id FROM directory_import_rows WHERE batch_id=$1", [
      batch.id,
    ])
  ).rows[0].id;
  const accepted = await Promise.all([
    acceptImportRow(row, admin),
    acceptImportRow(row, admin),
  ]);
  check(
    "Aceptar fila simultáneamente crea un solo borrador",
    accepted[0].entryId === accepted[1].entryId
  );
  check(
    "Importación nunca publica automáticamente",
    (await getEntry(String(accepted[0].entryId))) === null
  );
  const event = (await createEntry(
    "event",
    {
      ...data,
      name: "Competición ficticia externa",
      organizerName: "Organizador ficticio independiente",
      startDate: "2027-03-02",
      endDate: "2027-03-03",
      eventStatus: "confirmed",
      description: "Evento de prueba",
    },
    admin
  ))!;
  await setPublication(event.id, admin, "published");
  check(
    "Evento externo no necesita academia ficticia",
    (await getEntry(event.id))?.academyId === null
  );
  const ics = calendarFile((await getEntry(event.id))!);
  check(
    "Calendario conserva fecha sin inventar hora",
    ics.includes("DTSTART;VALUE=DATE:20270302") &&
      ics.includes("DTEND;VALUE=DATE:20270304") &&
      !ics.includes("DTSTART:20270302T000000")
  );
  const op = randomUUID();
  await query(
    "INSERT INTO academies(id,name,is_public,country_code,city) VALUES($1,'Academia operativa original',true,'es','Madrid')",
    [op]
  );
  check(
    "Proyección incluye academias originales sin migrar propietarios",
    (await listEntries({ kind: "academy" })).items.some((e) => e.id === op)
  );
  await materializeOperationalEntry(op);
  await query(
    "UPDATE academies SET name='Nombre operativo vigente' WHERE id=$1",
    [op]
  );
  check(
    "Espacio operativo es autoridad sobre datos públicos",
    (await getEntry(op))?.data.name === "Nombre operativo vigente"
  );
  await query("UPDATE academies SET is_public=false WHERE id=$1", [op]);
  check(
    "Privatizar academia la oculta inmediatamente",
    (await getEntry(op)) === null
  );
  const privateCollision = (await createEntry(
    "academy",
    { ...data, name: "Nombre operativo vigente", city: "Madrid" },
    admin
  ))!;
  await setPublication(privateCollision.id, admin, "published");
  check(
    "Una ficha externa no cuenta como duplicado de sí misma al activarse",
    (
      await rows(
        academyDuplicateQuery({
          ...data,
          name: "Nombre operativo vigente",
          city: "Madrid",
          excludeEntryId: privateCollision.id,
        })
      )
    ).length === 0
  );
  const privateIdentityMatch = (
    await rows(
      academyOperationalIdentityQuery({
        name: "Nombre operativo vigente",
        countryCode: "ES",
        city: "Madrid",
      })
    )
  )[0]?.exists;
  check(
    "La activación detecta un espacio privado sin exponer sus datos",
    privateIdentityMatch === true
  );
  const differentCityMatch = (
    await rows(
      academyOperationalIdentityQuery({
        name: "Nombre operativo vigente",
        countryCode: "ES",
        city: "Lima",
      })
    )
  )[0]?.exists;
  check(
    "La búsqueda privada no bloquea una sede distinta ya especificada",
    differentCityMatch === false
  );
  await query("UPDATE academies SET country_code=NULL WHERE id=$1", [op]);
  const unknownCountryMatch = (
    await rows(
      academyOperationalIdentityQuery({
        name: "Nombre operativo vigente",
        countryCode: "ES",
        city: "Madrid",
      })
    )
  )[0]?.exists;
  check(
    "Un país operativo desconocido requiere revisión y no se duplica",
    unknownCountryMatch === true
  );
  await query("DELETE FROM academies WHERE id=$1", [op]);
  check(
    "Eliminar autoridad nunca convierte la proyección en ficha externa",
    (await getEntry(op)) === null
  );
  const duplicate = (await createEntry(
    "academy",
    { ...data, name: "Duplicado ficticio" },
    admin
  ))!;
  await setPublication(duplicate.id, admin, "published");
  await mergeEntries(duplicate.id, entry.id, admin);
  check(
    "Fusión conserva destino y oculta origen",
    (await getEntry(duplicate.id, false))?.mergedInto === entry.id &&
      (await getEntry(duplicate.id)) === null
  );
  await assert.rejects(() =>
    requestSubscription(
      {
        email: "qa@example.org",
        purpose: "marketing",
        consent: false,
        version: "directory-2026-09-30",
        source: "directory",
      },
      null
    )
  );
  check("Sin autorización positiva no se crea consentimiento", true);
  check(
    "Marketing bloqueado antes de consentimiento",
    (await hasPositiveMarketingConsent("qa@example.org")) === false
  );
  await requestSubscription(
    {
      email: "qa@example.org",
      purpose: "marketing",
      consent: true,
      version: "directory-2026-09-30",
      source: "directory",
    },
    null
  );
  const subscription = (
    await query(
      "SELECT * FROM directory_subscriptions WHERE email='qa@example.org'"
    )
  ).rows[0];
  check(
    "Solicitud sin confirmar no autoriza marketing",
    (await hasPositiveMarketingConsent("qa@example.org")) === false
  );
  await confirmSubscription(
    subscription.id,
    confirmationToken(
      subscription.id,
      subscription.token_expires_at.toISOString()
    )
  );
  check(
    "Consentimiento confirmado autoriza finalidad específica",
    await hasPositiveMarketingConsent("qa@example.org")
  );
  await withdrawSubscription(
    subscription.id,
    unsubscribeToken(subscription.id)
  );
  check(
    "Baja bloquea marketing antes del envío",
    (await hasPositiveMarketingConsent("qa@example.org")) === false
  );
  await requestSubscription(
    {
      email: "calendar@example.org",
      purpose: "calendar",
      consent: true,
      version: "directory-2026-09-30",
      source: "directory",
    },
    null
  );
  let sentCalls = 0;
  const provider = async () => {
    sentCalls++;
    return { messageId: `test-provider-${sentCalls}`, simulated: false };
  };
  await Promise.all([processDeliveries(provider), processDeliveries(provider)]);
  check(
    "Cola concurrente envía una confirmación como máximo una vez",
    sentCalls === 1
  );
  await processDeliveries(provider);
  check("Reintento no repite mensajes enviados", sentCalls === 1);
  const deliverySubscription = (
    await query(
      "SELECT * FROM directory_subscriptions WHERE email='calendar@example.org'"
    )
  ).rows[0];
  await withdrawSubscription(
    deliverySubscription.id,
    unsubscribeToken(deliverySubscription.id)
  );
  await query(
    "INSERT INTO directory_deliveries(subscription_id,dedupe_key) VALUES($1,'calendar:withdrawn-test')",
    [deliverySubscription.id]
  );
  await processDeliveries(provider);
  check("Baja suprime mensaje pendiente antes del proveedor", sentCalls === 1);
  const retrySubscriptionId = randomUUID();
  await query(
    "INSERT INTO directory_subscriptions(id,email,purpose,policy_version,source,token_hash,token_expires_at) VALUES($1,'retry@example.org','kit','test','kit',$2,now()+interval '1 day')",
    [retrySubscriptionId, randomUUID().replace(/-/g, "").repeat(2)]
  );
  const retryDeliveryId = randomUUID();
  await query(
    "INSERT INTO directory_deliveries(id,subscription_id,dedupe_key,status,attempts,error) VALUES($1,$2,'retry-test','needs_review',1,'provider_result_requires_reconciliation')",
    [retryDeliveryId, retrySubscriptionId]
  );
  await rejects(
    "Reintentar requiere confirmar que el proveedor no aceptó el mensaje",
    () =>
      retryDelivery(retryDeliveryId, admin, false, "No se confirmó el estado"),
    "RECONCILIATION_REQUIRED"
  );
  const retryResults = await Promise.allSettled([
    retryDelivery(
      retryDeliveryId,
      admin,
      true,
      "Brevo revisado: no existe mensaje para el ID de entrega"
    ),
    retryDelivery(
      retryDeliveryId,
      admin,
      true,
      "Brevo revisado: no existe mensaje para el ID de entrega"
    ),
  ]);
  const retryState = (
    await query(
      "SELECT status,attempts FROM directory_deliveries WHERE id=$1",
      [retryDeliveryId]
    )
  ).rows[0];
  const retryAudit = (
    await query(
      "SELECT actor_id,metadata->>'deliveryId' AS delivery_id FROM directory_audit WHERE action='delivery_retry_queued' AND metadata->>'deliveryId'=$1",
      [retryDeliveryId]
    )
  ).rows[0];
  check(
    "Reintento confirmado encola una vez y conserva el mismo envío",
    retryResults.filter((result) => result.status === "fulfilled").length ===
      1 &&
      retryState.status === "pending" &&
      Number(retryState.attempts) === 1 &&
      retryAudit?.actor_id === admin &&
      retryAudit?.delivery_id === retryDeliveryId
  );
  const withdrawnSubscriptionId = randomUUID();
  await query(
    "INSERT INTO directory_subscriptions(id,email,purpose,policy_version,source,token_hash,token_expires_at,withdrawn_at) VALUES($1,'withdrawn-retry@example.org','kit','test','kit',$2,now()+interval '1 day',now())",
    [withdrawnSubscriptionId, randomUUID().replace(/-/g, "").repeat(2)]
  );
  const withdrawnDeliveryId = randomUUID();
  await query(
    "INSERT INTO directory_deliveries(id,subscription_id,dedupe_key,status,attempts,error) VALUES($1,$2,'withdrawn-retry-test','needs_review',1,'provider_result_requires_reconciliation')",
    [withdrawnDeliveryId, withdrawnSubscriptionId]
  );
  const withdrawnRetry = await retryDelivery(
    withdrawnDeliveryId,
    admin,
    true,
    "Brevo revisado; el destinatario canceló la suscripción"
  );
  const withdrawnRetryAudit = (
    await query(
      "SELECT actor_id,metadata->>'suppression' AS suppression FROM directory_audit WHERE action='delivery_retry_suppressed' AND metadata->>'deliveryId'=$1",
      [withdrawnDeliveryId]
    )
  ).rows[0];
  check(
    "La baja suprime el reintento de un envío en revisión",
    withdrawnRetry.suppressed &&
      (
        await query("SELECT status FROM directory_deliveries WHERE id=$1", [
          withdrawnDeliveryId,
        ])
      ).rows[0].status === "suppressed" &&
      withdrawnRetryAudit?.actor_id === admin &&
      withdrawnRetryAudit?.suppression === "withdrawn"
  );
  const bulkA = (await createEntry(
    "academy",
    { ...data, name: "Ficha masiva A" },
    admin
  ))!;
  const bulkB = (await createEntry(
    "academy",
    { ...data, name: "Ficha masiva B" },
    admin
  ))!;
  const preview = await bulkPublication(
    [bulkA.id, bulkB.id],
    "published",
    admin,
    "Revisión ficticia de lote"
  );
  check(
    "Previsualizar lote no publica fichas",
    !(await getEntry(bulkA.id)) && !(await getEntry(bulkB.id))
  );
  await editEntry(
    bulkA.id,
    admin,
    { ...bulkA.data, description: "Cambio después de previsualizar" },
    true
  );
  await rejects(
    "Lote cambiado exige otra previsualización",
    () =>
      bulkPublication(
        [bulkA.id, bulkB.id],
        "published",
        admin,
        "Revisión ficticia de lote",
        preview.fingerprint
      ),
    "STALE_BATCH"
  );
  const current = await bulkPublication(
    [bulkA.id, bulkB.id],
    "published",
    admin,
    "Revisión ficticia de lote"
  );
  await bulkPublication(
    [bulkA.id, bulkB.id],
    "published",
    admin,
    "Revisión ficticia de lote",
    current.fingerprint
  );
  check(
    "Publicación masiva aplica todas las fichas contrastadas",
    Boolean(await getEntry(bulkA.id)) && Boolean(await getEntry(bulkB.id))
  );
  const link = (await createEntry(
    "academy",
    { ...data, name: "Ficha para vinculación" },
    admin
  ))!;
  await setPublication(link.id, admin, "published");
  const linkClaim = await submitClaim(
    link.id,
    one,
    "Directora ficticia",
    "Prueba privada ficticia de representación"
  );
  await decideClaim(
    String(linkClaim.id),
    admin,
    true,
    "Prueba contrastada localmente"
  );
  const ownerProfile = randomUUID(),
    operativeId = randomUUID();
  await query("INSERT INTO profiles(id,user_id,role) VALUES($1,$2,$3)", [
    ownerProfile,
    two,
    "owner",
  ]);
  await query(
    "INSERT INTO academies(id,name,owner_id,country_code,city,is_public) VALUES($1,'Espacio ficticio',$2,'ES','Madrid',true)",
    [operativeId, ownerProfile]
  );
  await rejects(
    "Vincular no suplanta al propietario operativo",
    () =>
      linkOperationalEntry(
        link.id,
        operativeId,
        admin,
        "Vinculación contrastada localmente"
      ),
    "OWNER_MISMATCH"
  );
  await query("UPDATE profiles SET user_id=$1 WHERE id=$2", [
    one,
    ownerProfile,
  ]);
  await linkOperationalEntry(
    link.id,
    operativeId,
    admin,
    "Vinculación contrastada localmente"
  );
  check(
    "URL del espacio existente resuelve la ficha vinculada",
    (await getEntry(operativeId))?.id === link.id
  );
  check(
    "Vincular conserva propietario y no añade memberships",
    (await query("SELECT owner_id FROM academies WHERE id=$1", [operativeId]))
      .rows[0].owner_id === ownerProfile &&
      (await query("SELECT count(*)::int AS n FROM memberships")).rows[0].n ===
        0
  );
  await rejects(
    "Avisos de reclamación requieren cuenta",
    () =>
      requestSubscription(
        {
          email: "claim@example.org",
          purpose: "claim_updates",
          consent: true,
          version: "directory-2026-09-30",
          source: "my-listings",
        },
        null
      ),
    "AUTH_REQUIRED"
  );
  await requestSubscription(
    {
      email: "claim@example.org",
      purpose: "claim_updates",
      consent: true,
      version: "directory-2026-09-30",
      source: "my-listings",
    },
    one
  );
  const claimSub = (
    await query(
      "SELECT * FROM directory_subscriptions WHERE email='claim@example.org'"
    )
  ).rows[0];
  await confirmSubscription(
    claimSub.id,
    confirmationToken(
      claimSub.id,
      new Date(claimSub.token_expires_at).toISOString()
    )
  );
  await enqueueDigests();
  const notices: string[] = [];
  await processDeliveries(async (options) => {
    notices.push(options.text ?? "");
    return { messageId: `claim-test-${notices.length}`, simulated: false };
  });
  check(
    "Avisos de reclamación no incluyen pruebas privadas",
    notices.some((t) => t.includes("solicitud para")) &&
      notices.every(
        (t) => !t.includes("Prueba privada ficticia de representación")
      )
  );
  const client = await pool.connect();
  try {
    for (const role of ["anon", "authenticated"]) {
      await client.query(`SET ROLE ${role}`);
      const visible = await client.query("SELECT id FROM directory_entries");
      check(
        `${role}: no expone copias operativas que puedan quedar antiguas`,
        !visible.rows.some((r) => r.id === link.id)
      );
      check(
        `${role}: RLS oculta borradores`,
        !visible.rows.some((r) => r.id === drafts.id)
      );
      for (const table of [
        "directory_claims",
        "directory_grants",
        "directory_revisions",
        "directory_sources",
        "directory_subscriptions",
        "directory_deliveries",
        "directory_audit",
      ])
        await assert.rejects(
          () => client.query(`SELECT * FROM ${table}`),
          (e) => (e as { code: string }).code === "42501"
        );
      check(
        `${role}: Data API no expone pruebas, permisos ni consentimientos`,
        true
      );
      check(
        `${role}: no accede a atletas ni cobros`,
        (await client.query("SELECT * FROM athletes")).rowCount === 0 &&
          (await client.query("SELECT * FROM charges")).rowCount === 0
      );
      await assert.rejects(
        () =>
          client.query("UPDATE directory_entries SET publication='published'"),
        (e) => (e as { code: string }).code === "42501"
      );
      check(`${role}: no muta fichas directamente`, true);
      await client.query("RESET ROLE");
    }
  } finally {
    client.release();
  }
  console.log(
    `Directory integration: ${checks} checks passed; isolated PostgreSQL, exact migration and backup restored.`
  );
}
main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exitCode = 1;
  });

#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/**
 * Siembra un cargo `pending` para el athlete E2E de la academia aislada, de
 * forma que `tests/e2e-zaltyko-stripe-connect-flow.spec.ts` pueda ejercitar
 * `POST /api/charges/[id]/collect` off-session sin depender de que QA cree el
 * cargo a mano.
 *
 * Cierra el TODO que el propio spec declaraba:
 *   > No hay cargo pending en la academia E2E — créalo con
 *   > pnpm tsx scripts/seed-e2e-charge.ts
 *
 * Variables de entorno:
 *   - E2E_ALLOW_PROVISIONING=true   obligatoria (mismo safety belt que
 *                                    prepare-e2e-family-auth.ts).
 *   - DATABASE_URL                  Postgres de la academia de pruebas.
 *   - E2E_ACADEMY_ID                academia AISLADA (no operativa).
 *   - E2E_FAMILY_EMAIL              email del parent (default:
 *                                    e2e-family@zaltyko.test). Se usa para
 *                                    resolver el athlete sembrado por
 *                                    prepare-e2e-family-auth.ts.
 *   - E2E_ATHLETE_NAME              base del nombre del athlete (default:
 *                                    "E2E Athlete"). Debe coincidir con el
 *                                    usado al aprovisionar la familia.
 *   - E2E_CHARGE_AMOUNT_CENTS       importe del cargo (default: 1500 = 15,00).
 *   - E2E_CHARGE_LABEL              etiqueta (default: "E2E cuota off-session").
 *
 * Idempotente por (academia, athlete, period, label): si ya existe un cargo con
 * esa clave, lo devuelve reseteado a `pending` en vez de duplicarlo, de modo que
 * la suite live se puede correr varias veces seguidas.
 *
 * Uso:
 *   E2E_ALLOW_PROVISIONING=true E2E_ACADEMY_ID=<uuid> \
 *   pnpm tsx scripts/seed-e2e-charge.ts
 *
 * Imprime el chargeId en stdout (última línea, prefijo `chargeId=`) para que se
 * pueda capturar desde el runner: `E2E_CHARGE_ID=$(... | tail -1 | cut -d= -f2)`.
 */

const databaseUrl = process.env.DATABASE_URL;
const academyId = process.env.E2E_ACADEMY_ID;
const familyEmail = process.env.E2E_FAMILY_EMAIL ?? "e2e-family@zaltyko.test";
const athleteName = process.env.E2E_ATHLETE_NAME ?? "E2E Athlete";
const amountCents = Number.parseInt(process.env.E2E_CHARGE_AMOUNT_CENTS ?? "1500", 10);
const chargeLabel = process.env.E2E_CHARGE_LABEL ?? "E2E cuota off-session";
const caCertPath = process.env.NODE_EXTRA_CA_CERTS;
const ca =
  caCertPath && existsSync(resolve(caCertPath))
    ? readFileSync(resolve(caCertPath), "utf8")
    : undefined;

/** Periodo "YYYY-MM" del mes en curso, igual que el generador de cuotas. */
function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function resolveAthleteId(pool: Pool) {
  // Mismo nombre determinista que construye prepare-e2e-family-auth.ts.
  const deterministicName = `${athleteName} (${familyEmail.split("@")[0]})`;
  const result = await pool.query<{ id: string }>(
    "select id from athletes where academy_id = $1::uuid and name = $2 limit 1",
    [academyId, deterministicName]
  );
  const athleteId = result.rows[0]?.id;
  if (!athleteId) {
    throw new Error(
      `No existe el athlete E2E "${deterministicName}" en la academia ${academyId}. ` +
        "Corre primero `pnpm tsx scripts/prepare-e2e-family-auth.ts`."
    );
  }
  return athleteId;
}

async function upsertPendingCharge(pool: Pool, tenantId: string, athleteId: string) {
  const period = currentPeriod();
  const existing = await pool.query<{ id: string }>(
    `
      select id from charges
      where academy_id = $1::uuid
        and athlete_id = $2::uuid
        and period = $3
        and label = $4
      limit 1
    `,
    [academyId, athleteId, period, chargeLabel]
  );

  if (existing.rows[0]?.id) {
    // Reset a pending para permitir reruns de la suite live sin duplicar filas
    // ni arrastrar el payment_intent del intento anterior.
    const chargeId = existing.rows[0].id;
    await pool.query(
      `
        update charges set
          status = 'pending',
          amount_cents = $2,
          paid_at = null,
          payment_method = null,
          stripe_payment_intent_id = null,
          stripe_charge_id = null,
          attempt_count = 0,
          last_attempt_at = null,
          updated_at = now()
        where id = $1::uuid
      `,
      [chargeId, amountCents]
    );
    console.log(`charge: reset existente ${chargeId} → pending (${amountCents} cents, ${period})`);
    return chargeId;
  }

  const inserted = await pool.query<{ id: string }>(
    `
      insert into charges (tenant_id, academy_id, athlete_id, label, amount_cents, period, due_date, status)
      values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, current_date, 'pending')
      returning id
    `,
    [tenantId, academyId, athleteId, chargeLabel, amountCents, period]
  );
  const chargeId = inserted.rows[0]?.id;
  if (!chargeId) throw new Error("No se pudo crear el cargo E2E");
  console.log(`charge: creado ${chargeId} (${amountCents} cents, ${period})`);
  return chargeId;
}

async function main() {
  if (process.env.E2E_ALLOW_PROVISIONING !== "true") {
    throw new Error(
      "Refusing to seed E2E charges. Set E2E_ALLOW_PROVISIONING=true only for an approved isolated test academy."
    );
  }
  if (!databaseUrl || !academyId) {
    throw new Error("Missing DATABASE_URL or E2E_ACADEMY_ID");
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`E2E_CHARGE_AMOUNT_CENTS inválido: ${process.env.E2E_CHARGE_AMOUNT_CENTS}`);
  }

  const dbUrl = databaseUrl.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    ssl: ca ? { ca, rejectUnauthorized: true } : false,
  });

  try {
    const academyResult = await pool.query<{ tenant_id: string }>(
      "select tenant_id from academies where id = $1::uuid limit 1",
      [academyId]
    );
    const tenantId = academyResult.rows[0]?.tenant_id;
    if (!tenantId) throw new Error(`E2E academy not found: ${academyId}`);

    const athleteId = await resolveAthleteId(pool);
    const chargeId = await upsertPendingCharge(pool, tenantId, athleteId);

    console.log(`chargeId=${chargeId}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`E2E charge seed failed: ${error.message}`);
  process.exit(1);
});

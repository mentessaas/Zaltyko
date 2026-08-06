import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests de la entrega idempotente de avisos de cobro rechazado a los
 * tutores del atleta.
 *
 * El mock de DB emula una tabla `email_logs` en memoria, indexada por
 * `idempotencyKey` (UNIQUE), para que cada test pueda reproducir los
 * distintos escenarios de la matriz de idempotencia:
 *   - envio inicial OK
 *   - retry tras exito parcial (algunos 'sent', otros 'error')
 *   - retry tras fallo total (todos 'error')
 *   - nuevo evento Stripe sobre el mismo cargo (idempotencyKey distinto)
 *   - 'pending' lease respetado para no duplicar envios en vuelo
 */

type EmailLogStatus = "pending" | "sending" | "sent" | "error";

interface EmailLogRow {
  id: string;
  idempotencyKey: string;
  status: EmailLogStatus;
  toEmail: string;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
  attemptCount: number;
}

const { recipients, sendEmailMock, dbState } = vi.hoisted(() => {
  const recipients: Array<{ email: string | null }> = [];
  const dbState = {
    rows: new Map<string, EmailLogRow>(),
    insertCalls: [] as Array<{ key: string; toEmail: string }>,
    updateCalls: [] as Array<{ key: string; set: Record<string, unknown> }>,
  };
  return { recipients, sendEmailMock: vi.fn(), dbState };
});

// Marcamos las tablas y columnas que la produccion referencia para que
// el mock de `@/db` pueda enrutar la query a la cadena adecuada.
vi.mock("@/db/schema", () => ({
  emailLogs: {
    idempotencyKey: { _table: "email_logs", _col: "idempotency_key" },
    status: { _table: "email_logs", _col: "status" },
  },
  guardians: {
    email: { _table: "guardians", _col: "email" },
    tenantId: { _table: "guardians", _col: "tenant_id" },
    notifyEmail: { _table: "guardians", _col: "notify_email" },
  },
  guardianAthletes: {
    tenantId: { _table: "guardian_athletes", _col: "tenant_id" },
    athleteId: { _table: "guardian_athletes", _col: "athlete_id" },
    guardianId: { _table: "guardian_athletes", _col: "guardian_id" },
  },
  auditLogs: {},
  memberships: {},
  profiles: {},
  authUsers: {},
}));

vi.mock("@/db", () => {
  const selectForGuardians: Record<string, unknown> = {};
  selectForGuardians.from = vi.fn(() => selectForGuardians);
  selectForGuardians.innerJoin = vi.fn(() => selectForGuardians);
  selectForGuardians.where = vi.fn(() => Promise.resolve(recipients));

  // La cadena para email_logs SELECT la construimos on-demand en `from()`
  // segun el argumento `table._table`. Como la produccion distingue
  // ambas firmas (email_logs trae `idempotencyKey`, guardians trae `email`),
  // usamos ese marcador para enrutar.
  const selectForEmailLogs: Record<string, unknown> = {};
  selectForEmailLogs.from = vi.fn(() => selectForEmailLogs);
  selectForEmailLogs.where = vi.fn(() => selectForEmailLogs);
  // `where()` en email_logs devuelve la cadena; `limit(1)` resuelve con la fila
  // cuyo idempotencyKey coincide con el ultimo que la produccion pidio
  // actualizar/insertar. Mantenemos un puntero al ultimo key tocado.
  let lastTouchedKey: string | null = null;
  selectForEmailLogs.limit = vi.fn(() => {
    if (!lastTouchedKey) return Promise.resolve([]);
    const row = dbState.rows.get(lastTouchedKey);
    return Promise.resolve(row ? [row] : []);
  });
  // Helper para que el insert y el update señalen "este es el key activo".
  const signalKey = (key: string) => {
    lastTouchedKey = key;
  };

  const selectRouter = vi.fn((..._args: unknown[]) => {
    // No se usa: el routing se hace via `.from()` en la cadena unica.
    return selectForGuardians;
  });
  // Sobrescribimos el comportamiento del select para enrutar segun la
  // primera llamada a .from(). Cada llamada a db.select() devuelve una
  // cadena NUEVA; el routing depende de a que tabla apunte esa cadena.
  const realSelect = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn((table: any) => {
      if (table?.idempotencyKey) {
        // email_logs path
        chain.where = (cond: unknown) => {
          const key = extractKeyFromCondition(cond);
          if (key) signalKey(key);
          return chain;
        };
        chain.limit = vi.fn(() => {
          if (!lastTouchedKey) return Promise.resolve([]);
          const row = dbState.rows.get(lastTouchedKey);
          return Promise.resolve(row ? [row] : []);
        });
        return chain;
      }
      // guardian path
      chain.innerJoin = vi.fn(() => chain);
      chain.where = vi.fn(() => Promise.resolve(recipients));
      return chain;
    });
    return chain;
  });

  // INSERT chain para email_logs
  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: any) => {
    insertChain.onConflictDoNothing = vi.fn(() => {
      insertChain.returning = vi.fn(() => {
        if (dbState.rows.has(values.idempotencyKey)) {
          dbState.insertCalls.push({ key: values.idempotencyKey, toEmail: values.toEmail });
          return Promise.resolve([]);
        }
        const row: EmailLogRow = {
          id: `row_${dbState.rows.size + 1}`,
          idempotencyKey: values.idempotencyKey,
          status: "pending",
          toEmail: values.toEmail,
          errorMessage: null,
          sentAt: null,
          createdAt: new Date(),
          attemptCount: 1,
        };
        dbState.rows.set(values.idempotencyKey, row);
        dbState.insertCalls.push({ key: values.idempotencyKey, toEmail: values.toEmail });
        signalKey(values.idempotencyKey);
        return Promise.resolve([{ id: row.id, status: row.status, createdAt: row.createdAt }]);
      });
      return insertChain;
    });
    return insertChain;
  });

  // UPDATE chain para email_logs.
  // El codigo de produccion usa dos formas:
  //   1. CAS de reclamacion: .set({status}).where(...).returning() -> array
  //   2. Finalizacion post-envio: .set({status:'sent'}).where(...) -> await
  //      sin .returning()
  // El mock debe aplicar el SET al row en ambos casos para que SELECTs
  // subsecuentes vean el estado actualizado.
  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn((setValues: any) => {
    updateChain.where = vi.fn((whereCond: any) => {
      const key = extractKeyFromCondition(whereCond);
      if (key) signalKey(key);
      // Devolvemos un objeto Promise-like que aplica el SET al resolver
      // y que tambien expone `.returning()` para el caso CAS.
      const result: any = {
        returning: () => {
          if (!key || !dbState.rows.has(key)) return Promise.resolve([]);
          const row = dbState.rows.get(key)!;
          Object.assign(row, setValues);
          dbState.updateCalls.push({ key, set: setValues });
          return Promise.resolve([{ id: row.id }]);
        },
      };
      result.then = (onFulfilled: any) => {
        if (key && dbState.rows.has(key)) {
          Object.assign(dbState.rows.get(key)!, setValues);
          dbState.updateCalls.push({ key, set: setValues });
        }
        return Promise.resolve(undefined).then(onFulfilled);
      };
      return result;
    });
    return updateChain;
  });

  return {
    db: {
      select: realSelect,
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    },
  };
});

/**
 * Drizzle envuelve los literales de eq() en nodos SQL. Buscamos el primer
 * string que parezca una clave de idempotencia (prefijo `charge_failed:`
 * o cualquier clave presente en `dbState.rows`).
 */
function extractKeyFromCondition(condition: unknown): string | null {
  if (!condition || typeof condition !== "object") return null;
  const seen = new Set<string>();
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object" || seen.has((node as any).__id)) return null;
    seen.add((node as any).__id ?? Math.random().toString());
    if (typeof node === "string") {
      if (dbState.rows.has(node)) return node;
      return null;
    }
    const obj = node as Record<string, unknown>;
    for (const value of Object.values(obj)) {
      if (typeof value === "string") {
        if (dbState.rows.has(value)) return value;
        if (value.startsWith("charge_failed:")) return value;
      } else if (value && typeof value === "object") {
        const found = visit(value);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(condition);
}

vi.mock("@/lib/brevo", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/config", () => ({
  config: { brevo: { supportEmail: "soporte@example.test" } },
}));

import { sendChargePaymentFailedNotification } from "@/lib/stripe/notification-service";

const baseNotification = {
  chargeId: "charge_1",
  tenantId: "tenant_1",
  academyId: "academy_1",
  athleteId: "athlete_1",
  amountCents: 5000,
  currency: "eur",
  paymentIntentId: "pi_1",
  stripeEventId: "evt_1",
  failureReason: "card_declined",
};

function clearDbState() {
  dbState.rows.clear();
  dbState.insertCalls.length = 0;
  dbState.updateCalls.length = 0;
}

beforeEach(() => {
  recipients.length = 0;
  clearDbState();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ messageId: "message_1", simulated: false });
});

describe("sendChargePaymentFailedNotification — entrega idempotente por destinatario", () => {
  it("envia una sola vez por tutor y escapa contenido controlado por Stripe", async () => {
    recipients.push(
      { email: "tutor@example.test" },
      { email: "tutor@example.test" },
      { email: "segundo@example.test" }
    );

    const sent = await sendChargePaymentFailedNotification({
      ...baseNotification,
      failureReason: "<card_declined>",
    });

    expect(sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "tutor@example.test",
        html: expect.stringContaining("&lt;card_declined&gt;"),
      })
    );
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: "segundo@example.test" })
    );

    expect(dbState.rows.size).toBe(2);
    for (const row of dbState.rows.values()) {
      expect(row.status).toBe("sent");
    }
  });

  it("no inventa destinatario cuando el atleta no tiene tutor notificable", async () => {
    await expect(sendChargePaymentFailedNotification(baseNotification)).resolves.toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(dbState.rows.size).toBe(0);
  });

  it("idempotencia: dos llamadas con el mismo stripeEventId no duplican envios", async () => {
    recipients.push({ email: "tutor@example.test" });

    const first = await sendChargePaymentFailedNotification(baseNotification);
    const second = await sendChargePaymentFailedNotification(baseNotification);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(dbState.rows.size).toBe(1);
    const row = [...dbState.rows.values()][0];
    expect(row.status).toBe("sent");
  });

  it("evento nuevo sobre el mismo cargo: clave distinta, notifica de nuevo", async () => {
    // Stripe reintenta el cargo (otro payment_intent.payment_failed) y
    // genera un stripeEventId nuevo: la idempotencyKey cambia y la
    // notificacion se emite otra vez para los tutores que ya recibieron
    // el aviso anterior.
    recipients.push({ email: "tutor@example.test" });
    await sendChargePaymentFailedNotification(baseNotification);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    await sendChargePaymentFailedNotification({
      ...baseNotification,
      stripeEventId: "evt_2_distinto",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(dbState.rows.size).toBe(2);
    expect([...dbState.rows.values()].map((row) => row.status)).toEqual([
      "sent",
      "sent",
    ]);
  });

  it("exito parcial + retry: solo se reenvia a los destinatarios que fallaron", async () => {
    // Primer intento: A y B se envian OK, C falla. El caller propaga el
    // fallo y Stripe reintenta. En el retry, A y B deben quedar skipped
    // y C debe reintentar.
    recipients.push(
      { email: "a@example.test" },
      { email: "b@example.test" },
      { email: "c@example.test" }
    );

    sendEmailMock
      .mockResolvedValueOnce({ messageId: "m_a", simulated: false })
      .mockResolvedValueOnce({ messageId: "m_b", simulated: false })
      .mockRejectedValueOnce(new Error("BREVO_API_ERROR:503"));

    await expect(sendChargePaymentFailedNotification(baseNotification)).rejects.toThrow(
      "BREVO_API_ERROR:503"
    );

    const rowA = [...dbState.rows.values()].find((row) => row.toEmail === "a@example.test");
    const rowB = [...dbState.rows.values()].find((row) => row.toEmail === "b@example.test");
    const rowC = [...dbState.rows.values()].find((row) => row.toEmail === "c@example.test");
    expect(rowA?.status).toBe("sent");
    expect(rowB?.status).toBe("sent");
    expect(rowC?.status).toBe("error");
    expect(rowC?.errorMessage).toBe("BREVO_API_ERROR:503");

    // Retry: A y B se skipean (INSERT conflict + status='sent'), C se
    // reclama via CAS (status='error' -> 'sending') y se envia OK.
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ messageId: "m_c_retry", simulated: false });

    const second = await sendChargePaymentFailedNotification(baseNotification);

    expect(second).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "c@example.test" })
    );
    expect(rowC?.status).toBe("sent");
  });

  it("'pending' fresco (lease vigente): el retry no reenvia aunque la fila siga pendiente", async () => {
    // Escenario real: sendEmail resolvio OK al proveedor (el usuario
    // recibio el correo), pero el UPDATE posterior a status='sent' fallo
    // por un blip de DB. La fila queda visiblemente en 'pending'. El
    // caller propaga el error y Stripe reintenta. La rama de lease
    // (pending dentro de los 60s) garantiza que NO se reenvia: el
    // destinatario ya recibio el correo.
    recipients.push({ email: "tutor@example.test" });

    const key = `charge_failed:${baseNotification.stripeEventId}:${baseNotification.chargeId}:tutor@example.test`;
    dbState.rows.set(key, {
      id: "row_pending",
      idempotencyKey: key,
      status: "pending",
      toEmail: "tutor@example.test",
      errorMessage: null,
      sentAt: null,
      createdAt: new Date(), // fresco: dentro del lease
      attemptCount: 1,
    });

    // El retorno es `false` porque delivered=0 y attempted=0: el
    // destinatario se skipeo por lease. El handler del webhook ignora el
    // retorno y marca el billing_event como `processed` para no
    // reintentar en bucle.
    const second = await sendChargePaymentFailedNotification(baseNotification);
    expect(second).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
/**
 * Helpers para mockear `@/db` en tests vitest.
 *
 * Uso típico:
 *
 *   import { createDbMock } from "@/db/testing";
 *
 *   const { db, state } = createDbMock();
 *   vi.mock("@/db", () => ({ db }));
 *
 *   it("...", async () => {
 *     state.selectQueue.push([{ id: "row-1" }]);
 *     // ... call code under test ...
 *     expect(state.updates).toMatchObject([{ status: "paid" }]);
 *   });
 *
 * Centraliza los patrones que antes se duplicaban en cada test:
 *   - `select().from().where().limit()` con cola de resultados
 *   - `insert().values().onConflictDoNothing()` que registra valores
 *   - `update().set().where()` que registra payloads
 *   - `execute()` para SQL crudo (advisory locks, etc.)
 *   - `transaction(callback)` que ejecuta el callback con el mismo dbMock
 *
 * Los tests con requisitos especiales (queue-on-where, middlewares, joins
 * específicos) siguen pudiendo usar mocks inline — este helper no pretende
 * cubrir el 100 % de los casos.
 */
import { vi, type Mock } from "vitest";

export interface DbMockState {
  /** Cola FIFO consumida por cada `db.select().from(...).where(...)`. */
  selectQueue: unknown[][];
  /** Todos los payloads pasados a `db.update().set(payload)`. */
  updates: unknown[];
  /** Todos los payloads pasados a `db.insert(table).values(payload)`. */
  inserts: unknown[];
  /** Cada llamada a `db.delete()` registra `true` aquí. */
  deletes: boolean[];
  /** Cada llamada a `db.execute(sql)` registra `true` aquí. */
  executions: unknown[];
}

export interface DbMockOptions {
  /**
   * Pre-cargar resultados en `state.selectQueue`. Equivalente a hacer
   * `state.selectQueue.push([...])` antes del test.
   */
  selectResults?: unknown[][];
  /**
   * Si `true`, el callback de `transaction()` se ejecuta con un objeto tx
   * que expone `select/insert/update/delete/execute` apuntando a los mismos
   * spies del mock. Por defecto: true.
   */
  withTransaction?: boolean;
}

export interface DbMockHandle {
  db: {
    select: Mock;
    insert: Mock;
    update: Mock;
    delete: Mock;
    execute: Mock;
    transaction: Mock;
  };
  state: DbMockState;
}

/**
 * Construye una cadena `thenable` que imita una query Drizzle.
 *
 * Cada llamada a `.from()`, `.where()`, `.innerJoin()`, `.leftJoin()`,
 * `.orderBy()`, `.offset()` devuelve la misma cadena (para que los chains
 * tipo `db.select().from(t).where(c).limit(1)` funcionen).
 *
 * `.limit()` resuelve con `result`. La cadena implementa `then` para que
 * `await db.select().from(t).where(c)` funcione directamente (algunos
 * call sites no llaman a `.limit()` explícitamente).
 */
export function createQueryChain<T = unknown>(result: T[]): Promise<T[]> & Record<string, unknown> {
  const chain: any = {};
  for (const method of ["from", "innerJoin", "leftJoin", "orderBy", "offset", "groupBy"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.returning = vi.fn(() => Promise.resolve(result));
  Object.defineProperty(chain, "then", {
    value: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return chain as Promise<T[]> & Record<string, unknown>;
}

/**
 * Crea un mock de `@/db` con cola FIFO para selects, registro de
 * insert/update/delete/execute, y soporte opcional para `transaction()`.
 *
 * Los métodos son `vi.fn()` así que cada test puede inspeccionarlos con
 * `.mock.calls`, `.mockReturnValue`, etc.
 */
export function createDbMock(options: DbMockOptions = {}): DbMockHandle {
  const state: DbMockState = {
    selectQueue: options.selectResults ? [...options.selectResults] : [],
    updates: [],
    inserts: [],
    deletes: [],
    executions: [],
  };

  const select = vi.fn(() => {
    const next = state.selectQueue.shift() ?? [];
    return createQueryChain(next);
  });

  const insert = vi.fn(() => {
    const chain: any = {};
    chain.values = vi.fn((value: unknown) => {
      state.inserts.push(value);
      chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
      chain.onConflictDoUpdate = vi.fn(() => {
        chain.where = vi.fn().mockResolvedValue(undefined);
        return chain;
      });
      chain.returning = vi.fn(() => Promise.resolve([{ id: "inserted-id" }]));
      return chain;
    });
    return chain;
  });

  const update = vi.fn(() => {
    const chain: any = {};
    chain.set = vi.fn((payload: unknown) => {
      state.updates.push(payload);
      const whereChain: any = {};
      whereChain.where = vi.fn(() => Promise.resolve([]));
      whereChain.returning = vi.fn(() => Promise.resolve([{ id: "updated-id" }]));
      return whereChain;
    });
    return chain;
  });

  const deleteFn = vi.fn(() => {
    const chain: any = {};
    chain.where = vi.fn(() => {
      state.deletes.push(true);
      chain.returning = vi.fn(() => Promise.resolve([]));
      return chain;
    });
    return chain;
  });

  const execute = vi.fn(async (...args: unknown[]) => {
    state.executions.push(args);
    return undefined;
  });

  const withTransaction = options.withTransaction ?? true;

  const transaction = withTransaction
    ? vi.fn(async (callback: (tx: unknown) => unknown) => {
        const tx = {
          select,
          insert,
          update,
          delete: deleteFn,
          execute,
        };
        return await callback(tx);
      })
    : vi.fn(async () => undefined);

  return {
    db: { select, insert, update, delete: deleteFn, execute, transaction },
    state,
  };
}
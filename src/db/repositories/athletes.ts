/**
 * Repositorio de atletas.
 *
 * Centraliza queries a la tabla `athletes` con filtrado automatico por
 * `tenantId` y `academyId` para que los handlers no tengan que recordar
 * el `where(eq(athletes.tenantId, ...))` en cada llamada.
 *
 * Antes de usar, los handlers deben haber pasado por `withTenant` o
 * `withBearerTenant` para tener `tenantId` disponible en el contexto.
 *
 * Patron:
 *   const athletes = await athletesRepo.listForAcademy(context.tenantId, context.academyId);
 */
import { and, eq, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { athletes } from "@/db/schema/athletes";

type AthleteRow = typeof athletes.$inferSelect;

export interface ListAthletesOptions {
  status?: "active" | "inactive" | "archived";
  limit?: number;
  offset?: number;
  orderBy?: "name" | "createdAt" | "level";
  orderDir?: "asc" | "desc";
}

export const athletesRepo = {
  /**
   * Lista atletas de una academia con paginacion y filtros basicos.
   * Filtra siempre por tenantId + academyId (defensa en profundidad ademas
   * de RLS).
   */
  async listForAcademy(
    tenantId: string,
    academyId: string,
    options: ListAthletesOptions = {}
  ): Promise<AthleteRow[]> {
    const {
      status,
      limit = 50,
      offset = 0,
      orderBy = "createdAt",
      orderDir = "desc",
    } = options;

    const conditions = [
      eq(athletes.tenantId, tenantId),
      eq(athletes.academyId, academyId),
    ];
    if (status) conditions.push(eq(athletes.status, status));

    const orderColumn =
      orderBy === "name" ? athletes.name
      : orderBy === "level" ? athletes.level
      : athletes.createdAt;

    return await db
      .select()
      .from(athletes)
      .where(and(...conditions))
      .orderBy(orderDir === "asc" ? asc(orderColumn) : desc(orderColumn))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Cuenta atletas por academia y opcionalmente por status.
   */
  async countForAcademy(
    tenantId: string,
    academyId: string,
    status?: ListAthletesOptions["status"]
  ): Promise<number> {
    const conditions = [
      eq(athletes.tenantId, tenantId),
      eq(athletes.academyId, academyId),
    ];
    if (status) conditions.push(eq(athletes.status, status));

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(athletes)
      .where(and(...conditions));
    return Number(result[0]?.count ?? 0);
  },

  /**
   * Obtiene un atleta por ID validando tenant. Devuelve null si no
   * pertenece al tenant (no leak entre tenants aunque RLS falle).
   */
  async findById(tenantId: string, id: string): Promise<AthleteRow | null> {
    const result = await db
      .select()
      .from(athletes)
      .where(and(eq(athletes.tenantId, tenantId), eq(athletes.id, id)))
      .limit(1);
    return result[0] ?? null;
  },
};

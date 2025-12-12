import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { withTenant } from "@/lib/authz";

/**
 * @swagger
 * /api/billing/plans:
 *   get:
 *     summary: Obtiene los planes de suscripción disponibles
 *     description: Retorna una lista de planes activos ordenados por precio
 *     tags:
 *       - Billing
 *     responses:
 *       200:
 *         description: Lista de planes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   code:
 *                     type: string
 *                   nickname:
 *                     type: string
 *                   priceEur:
 *                     type: number
 *                   currency:
 *                     type: string
 *                   billingInterval:
 *                     type: string
 *                   athleteLimit:
 *                     type: integer
 *                   stripePriceId:
 *                     type: string
 */
export const GET = withTenant(async () => {
  const items = await db
    .select({
      code: plans.code,
      nickname: plans.nickname,
      priceEur: plans.priceEur,
      currency: plans.currency,
      billingInterval: plans.billingInterval,
      athleteLimit: plans.athleteLimit,
      stripePriceId: plans.stripePriceId,
      isArchived: plans.isArchived,
    })
    .from(plans)
    .where(eq(plans.isArchived, false))
    .orderBy(asc(plans.priceEur));

  return NextResponse.json(items);
});



import { Metadata } from "next";
import { and, count, desc, eq, gte, lt, sum } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  plans,
  subscriptions,
} from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de Súper Admin",
  description: "Métricas globales de academias y monetización.",
};

async function getAcademiesByPlan() {
  const total = count(subscriptions.id).as("total");
  const rows = await db
    .select({ code: plans.code, total })
    .from(plans)
    .leftJoin(subscriptions, eq(plans.id, subscriptions.planId))
    .groupBy(plans.code);

  return rows;
}

async function getEstimatedMRR() {
  const [row] = await db
    .select({ amount: sum(plans.priceEur).as("amount") })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.status, "active"));

  return Number(row?.amount ?? 0);
}

async function getGrowthMetrics() {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [currentSeven] = await db
    .select({ value: count() })
    .from(academies)
    .where(gte(academies.createdAt, sevenDaysAgo));

  const [previousSeven] = await db
    .select({ value: count() })
    .from(academies)
    .where(and(gte(academies.createdAt, fourteenDaysAgo), lt(academies.createdAt, sevenDaysAgo)));

  const [currentThirty] = await db
    .select({ value: count() })
    .from(academies)
    .where(gte(academies.createdAt, thirtyDaysAgo));

  const [previousThirty] = await db
    .select({ value: count() })
    .from(academies)
    .where(and(gte(academies.createdAt, sixtyDaysAgo), lt(academies.createdAt, thirtyDaysAgo)));

  const growth7 = previousSeven?.value
    ? ((Number(currentSeven?.value ?? 0) - Number(previousSeven.value)) / Number(previousSeven.value)) * 100
    : 100;

  const growth30 = previousThirty?.value
    ? ((Number(currentThirty?.value ?? 0) - Number(previousThirty.value)) / Number(previousThirty.value)) * 100
    : 100;

  return {
    growth7: Math.round(growth7),
    growth30: Math.round(growth30),
  };
}

async function getTopAcademies() {
  const totalAthletes = count(athletes.id).as("totalAthletes");
  const rows = await db
    .select({ academyId: academies.id, name: academies.name, totalAthletes })
    .from(academies)
    .leftJoin(athletes, eq(athletes.academyId, academies.id))
    .groupBy(academies.id, academies.name)
    .orderBy(desc(totalAthletes))
    .limit(5);

  return rows.map((row) => ({
    academyId: row.academyId,
    name: row.name,
    totalAthletes: Number(row.totalAthletes ?? 0),
  }));
}

export default async function SuperAdminDashboard() {
  const [byPlan, estimatedMRR, growth, top] = await Promise.all([
    getAcademiesByPlan(),
    getEstimatedMRR(),
    getGrowthMetrics(),
    getTopAcademies(),
  ]);

  return (
    <div className="space-y-8 p-8">
      <header>
        <h1 className="text-3xl font-semibold">Panel de Súper Admin</h1>
        <p className="text-muted-foreground">Visión general de academias, planes y monetización.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {byPlan.map((item) => (
          <div key={item.code} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">Academias plan {item.code}</p>
            <p className="text-2xl font-semibold">{Number(item.total ?? 0)}</p>
          </div>
        ))}
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">MRR estimado</p>
          <p className="text-2xl font-semibold">€{(estimatedMRR / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Crecimiento 7 días</p>
          <p className="text-2xl font-semibold">{growth.growth7}%</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Crecimiento 30 días</p>
          <p className="text-2xl font-semibold">{growth.growth30}%</p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-medium">Top 5 academias por atletas</h2>
        <ul className="mt-2 space-y-2">
          {top.length === 0 && (
            <li className="text-sm text-muted-foreground">No hay datos suficientes todavía.</li>
          )}
          {top.map((academy) => (
            <li key={academy.academyId} className="flex items-center justify-between rounded bg-muted p-2">
              <span>{academy.name}</span>
              <span className="text-sm text-muted-foreground">{academy.totalAthletes} atletas</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

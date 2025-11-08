import { Metadata } from "next";
import { and, count, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  events,
  familyContacts,
  plans,
  subscriptions,
} from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";

interface PageProps {
  params: {
    academyId: string;
  };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  const name = academy?.name ?? "Academia";

  return {
    title: `${name} · Dashboard`,
    description: `Panel de control para la academia ${name}.`,
  };
}

async function getCounts(academyId: string) {
  const [athleteRow] = await db
    .select({ value: count() })
    .from(athletes)
    .where(eq(athletes.academyId, academyId));

  const [classRow] = await db
    .select({ value: count() })
    .from(classes)
    .where(eq(classes.academyId, academyId));

  const [contactRow] = await db
    .select({ value: count() })
    .from(familyContacts)
    .innerJoin(athletes, eq(familyContacts.athleteId, athletes.id))
    .where(eq(athletes.academyId, academyId));

  const now = new Date();
  const weekAhead = new Date();
  weekAhead.setDate(now.getDate() + 7);

  const [eventsRow] = await db
    .select({ value: count() })
    .from(events)
    .where(
      and(
        eq(events.academyId, academyId),
        gte(events.date, now),
        lte(events.date, weekAhead)
      )
    );

  return {
    athletes: Number(athleteRow?.value ?? 0),
    classesWeek: Number(classRow?.value ?? 0),
    upcomingEvents: Number(eventsRow?.value ?? 0),
    familyContacts: Number(contactRow?.value ?? 0),
  };
}

async function getUpcomingEvents(academyId: string) {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      date: events.date,
      location: events.location,
    })
    .from(events)
    .where(and(eq(events.academyId, academyId), gte(events.date, new Date())))
    .orderBy(events.date)
    .limit(3);

  return rows;
}

async function getNextSession(academyId: string) {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      className: classes.name,
    })
    .from(classSessions)
    .innerJoin(classes, and(eq(classes.id, classSessions.classId), eq(classes.academyId, academyId)))
    .where(gte(classSessions.sessionDate, today))
    .orderBy(classSessions.sessionDate)
    .limit(1);

  const next = rows[0];

  if (!next) {
    return null;
  }

  const attendance = await db
    .select({
      status: attendanceRecords.status,
      total: count(attendanceRecords.id),
    })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, next.id))
    .groupBy(attendanceRecords.status);

  return { session: next, attendance };
}

async function getSubscriptionSummary(academyId: string) {
  const active = await getActiveSubscription(academyId);

  const [subscription] = await db
    .select({
      planCode: plans.code,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.academyId, academyId))
    .limit(1);

  return {
    planCode: (subscription?.planCode as string | undefined) ?? active.planCode,
    status: subscription?.status ?? "active",
    athleteLimit: active.athleteLimit,
    classLimit: active.classLimit,
  };
}

export default async function AcademyDashboard({ params }: PageProps) {
  const { academyId } = params;

  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  const summary = await getSubscriptionSummary(academyId);
  const counts = await getCounts(academyId);
  const eventsList = await getUpcomingEvents(academyId);
  const nextSession = await getNextSession(academyId);

  const usagePercent = summary.athleteLimit
    ? Math.min(100, Math.round((counts.athletes / summary.athleteLimit) * 100))
    : 0;

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard · {academy?.name ?? "Academia"}</h1>
        <p className="text-muted-foreground">Resumen operativo y de membresía.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Atletas</p>
          <p className="text-2xl font-semibold">{counts.athletes}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Clases / semana</p>
          <p className="text-2xl font-semibold">{counts.classesWeek}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Eventos próximos</p>
          <p className="text-2xl font-semibold">{counts.upcomingEvents}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Familiares registrados</p>
          <p className="text-2xl font-semibold">{counts.familyContacts}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-medium">Plan actual</h2>
          <p className="text-sm text-muted-foreground">Código: {summary.planCode}</p>
          <p className="text-sm text-muted-foreground capitalize">Estado: {summary.status}</p>
          <p className="text-sm text-muted-foreground">
            Límite de atletas: {summary.athleteLimit ?? "Ilimitado"}
          </p>
          <p className="text-sm text-muted-foreground">
            Límite de clases: {summary.classLimit ?? "Ilimitado"}
          </p>
          <p className="text-sm text-muted-foreground">Uso: {usagePercent}%</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-medium">Próxima sesión</h2>
          {nextSession ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">{nextSession.session.className}</p>
              <p className="text-muted-foreground">
                {nextSession.session.sessionDate} · {nextSession.session.startTime} - {nextSession.session.endTime}
              </p>
              <div className="space-y-1">
                {nextSession.attendance.map((record) => (
                  <p key={record.status} className="flex justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{record.status}</span>
                    <span>{record.total}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay sesiones programadas.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-medium">Próximos eventos</h2>
          <ul className="mt-2 space-y-2">
            {eventsList.length === 0 && (
              <li className="text-sm text-muted-foreground">Sin eventos programados.</li>
            )}
            {eventsList.map((event) => (
              <li key={event.id} className="rounded bg-muted p-2">
                <p className="font-medium">{event.title}</p>
                {event.date && (
                  <p className="text-xs text-muted-foreground">
                    {event.date.toLocaleDateString()} · {event.location ?? "Por definir"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-medium">Contactos familiares</h2>
          <p className="text-sm text-muted-foreground">
            Registra responsables para enviar recordatorios automáticos y avisos de asistencia.
          </p>
          <p className="mt-4 text-2xl font-semibold">{counts.familyContacts}</p>
        </div>
      </section>
    </div>
  );
}

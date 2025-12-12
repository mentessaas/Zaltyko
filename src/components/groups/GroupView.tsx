"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { GroupDetail, AthleteOption, CoachOption } from "./types";
import { UpdateGroupMembersDialog } from "./UpdateGroupMembersDialog";
import { UpdateGroupCoachesDialog } from "./UpdateGroupCoachesDialog";

interface GroupViewProps {
  academyId: string;
  group: GroupDetail;
  availableAthletes: AthleteOption[];
  availableCoaches: CoachOption[];
}

interface GroupSummary {
  groupId: string;
  groupName: string;
  activeAthletesCount: number;
  monthlyFeeCents: number;
  period: string;
  expectedTotalCents: number;
  paidTotalCents: number;
  pendingOrOverdueTotalCents: number;
}

export function GroupView({ academyId, group, availableAthletes, availableCoaches }: GroupViewProps) {
  const [detail, setDetail] = useState(group);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [coachesDialogOpen, setCoachesDialogOpen] = useState(false);
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const disciplineLabel = useMemo(() => {
    switch (detail.discipline) {
      case "artistica":
        return "Gimnasia artística";
      case "ritmica":
        return "Gimnasia rítmica";
      case "trampolin":
        return "Trampolín";
      default:
        return "General / Mixta";
    }
  }, [detail.discipline]);

  const assistantsLookup = useMemo(() => new Set(detail.assistantIds), [detail.assistantIds]);

  // Load economic summary
  useEffect(() => {
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const res = await fetch(`/api/groups/${group.id}/summary?period=${period}`);
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } catch (error) {
        console.error("Error loading group summary:", error);
      } finally {
        setLoadingSummary(false);
      }
    };
    loadSummary();
  }, [group.id]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{detail.name}</h1>
              {detail.color && (
                <span
                  className="inline-flex h-6 w-6 rounded-full border border-border"
                  style={{ backgroundColor: detail.color }}
                  aria-label={`Color ${detail.color}`}
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {disciplineLabel}
              {detail.level ? ` · ${detail.level}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Creado el {new Date(detail.createdAt).toLocaleDateString("es-ES")}</span>
              <span>· {detail.athleteCount} atleta{detail.athleteCount === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              Coach principal: {detail.coachName ?? "Sin asignar"}
            </span>
            <Button variant="outline" onClick={() => setCoachesDialogOpen(true)}>
              Editar entrenadores
            </Button>
            <Button onClick={() => setMembersDialogOpen(true)}>Editar atletas</Button>
          </div>
        </div>
      </section>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="athletes">Atletas</TabsTrigger>
          <TabsTrigger value="coaches">Entrenadores</TabsTrigger>
          <TabsTrigger value="classes">Clases</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Disciplina" value={disciplineLabel} />
            <SummaryCard title="Nivel" value={detail.level ?? "Sin nivel"} />
            <SummaryCard title="Entrenadores" value={`${(detail.coachId ? 1 : 0) + detail.assistantIds.length}`} />
            <SummaryCard title="Atletas" value={`${detail.athleteCount}`} />
          </div>
          <p className="text-sm text-muted-foreground">
            Los grupos te permiten automatizar asistencia, evaluaciones y notificaciones. Asigna atletas y
            entrenadores para empezar a usarlos en tus flujos diarios.
          </p>

          {/* Resumen económico del grupo */}
          {summary && (
            <section className="mt-6 rounded-lg border border-border bg-muted/30 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Resumen económico del grupo</h3>
                  <p className="text-xs text-muted-foreground">
                    {summary.activeAthletesCount} atleta{summary.activeAthletesCount === 1 ? "" : "s"} activo{summary.activeAthletesCount === 1 ? "" : "s"}
                    {summary.monthlyFeeCents > 0 && ` · Cuota mensual: ${(summary.monthlyFeeCents / 100).toFixed(2)} €`}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/app/${academyId}/billing?tab=student-charges&groupId=${group.id}`}>
                    Ver cobros de este grupo
                  </Link>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">Total esperado</p>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {(summary.expectedTotalCents / 100).toFixed(2)} €
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">Total cobrado</p>
                  <p className="mt-1 text-base font-semibold text-green-600">
                    {(summary.paidTotalCents / 100).toFixed(2)} €
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">Pendiente / Atrasado</p>
                  <p className="mt-1 text-base font-semibold text-yellow-600">
                    {(summary.pendingOrOverdueTotalCents / 100).toFixed(2)} €
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Periodo: {new Date(`${summary.period}-01`).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
              </p>
            </section>
          )}
          {loadingSummary && (
            <div className="mt-6 rounded-lg border border-border bg-muted/30 p-5">
              <p className="text-sm text-muted-foreground">Cargando resumen económico...</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="athletes" className="space-y-4">
          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Atletas asignados</h2>
                <p className="text-sm text-muted-foreground">
                  {detail.members.length} atleta{detail.members.length === 1 ? "" : "s"} forman parte de este grupo.
                </p>
              </div>
              <Button variant="outline" onClick={() => setMembersDialogOpen(true)}>
                Actualizar atletas
              </Button>
            </header>
            {detail.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay atletas en este grupo. Añádelos para llevar su progreso y asistencia.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Nivel</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background text-foreground">
                    {detail.members.map((member) => (
                      <tr key={member.id}>
                        <td className="px-4 py-3 font-medium">{member.name}</td>
                        <td className="px-4 py-3">{member.level ?? "—"}</td>
                        <td className="px-4 py-3 capitalize">{member.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="coaches" className="space-y-4">
          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Equipo responsable</h2>
                <p className="text-sm text-muted-foreground">
                  Define quién lidera y apoya a este grupo.
                </p>
              </div>
              <Button variant="outline" onClick={() => setCoachesDialogOpen(true)}>
                Editar equipo
              </Button>
            </header>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Entrenador principal</h3>
                <p className="text-sm text-muted-foreground">
                  {detail.coachName ?? "Sin asignar"}
                  {detail.coachEmail ? ` · ${detail.coachEmail}` : ""}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Asistentes</h3>
                {detail.assistants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay asistentes asignados.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {detail.assistants.map((assistant) => (
                      <li key={assistant.id}>
                        {assistant.name}
                        {assistant.email ? ` · ${assistant.email}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="classes" className="rounded-xl border bg-card p-6 shadow-sm">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Clases relacionadas</h2>
              <p className="text-sm text-muted-foreground">
                Basado en los entrenadores asignados a este grupo.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/app/${academyId}/classes`}>Ir al módulo de clases</Link>
            </Button>
          </header>

          {detail.classes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No encontramos clases relacionadas con los entrenadores de este grupo. Puedes asignarlas desde el
              módulo de clases.
            </div>
          ) : (
            <div className="space-y-3">
              {detail.classes.map((clazz) => (
                <div
                  key={clazz.id}
                  className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{clazz.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatWeekdays(clazz.weekdays)} · {formatTimeRange(clazz.startTime, clazz.endTime)}
                      </p>
                    </div>
                    <Button variant="ghost" asChild size="sm" className="text-xs">
                      <Link href={`/app/${academyId}/classes/${clazz.id}`}>Ver clase</Link>
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {clazz.coachNames.length === 0 ? (
                      <span className="rounded-full bg-white/60 px-3 py-1">Sin entrenadores asignados</span>
                    ) : (
                      clazz.coachNames.map((name) => (
                        <span key={name} className="rounded-full bg-white/60 px-3 py-1 font-medium">
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="evaluations" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Muy pronto podrás consultar evaluaciones y progreso promedio del grupo desde aquí.
        </TabsContent>
      </Tabs>

      <UpdateGroupMembersDialog
        academyId={academyId}
        groupId={detail.id}
        open={membersDialogOpen}
        selected={detail.members.map((member) => member.id)}
        athletes={availableAthletes}
        onClose={() => setMembersDialogOpen(false)}
        onUpdated={async (ids) => {
          const newMembers = availableAthletes
            .filter((athlete) => ids.includes(athlete.id))
            .map((athlete) => ({
              id: athlete.id,
              name: athlete.name,
              level: athlete.level,
              status: athlete.status,
            }));
          setDetail((prev) => ({
            ...prev,
            members: newMembers,
            athleteCount: newMembers.length,
          }));
        }}
      />

      <UpdateGroupCoachesDialog
        academyId={academyId}
        groupId={detail.id}
        open={coachesDialogOpen}
        coachId={detail.coachId}
        assistantIds={detail.assistantIds}
        coaches={availableCoaches}
        onClose={() => setCoachesDialogOpen(false)}
        onUpdated={async (coach, assistants) => {
          const coachOption = coach ? availableCoaches.find((c) => c.id === coach) ?? null : null;
          const assistantOptions = availableCoaches.filter((c) => assistants.includes(c.id));
          setDetail((prev) => ({
            ...prev,
            coachId: coach,
            coachName: coachOption?.name ?? null,
            coachEmail: coachOption?.email ?? null,
            assistantIds: assistants,
            assistants: assistantOptions,
            assistantNames: assistantOptions.map((assistant) => assistant.name),
          }));
        }}
      />
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatWeekdays(weekdays: number[]) {
  if (!weekdays.length) return "Día variable";
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`)
    .join(", ");
}

function formatTimeRange(startTime: string | null, endTime: string | null) {
  if (startTime && endTime) return `${startTime.slice(0, 5)} – ${endTime.slice(0, 5)}`;
  if (startTime) return `Desde ${startTime.slice(0, 5)}`;
  return "Horario flexible";
}

"use client";

import { useMemo, useState } from "react";

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

export function GroupView({ academyId, group, availableAthletes, availableCoaches }: GroupViewProps) {
  const [detail, setDetail] = useState(group);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [coachesDialogOpen, setCoachesDialogOpen] = useState(false);

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

        <TabsContent value="classes" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          La integración con clases estará disponible en la siguiente fase. Mientras tanto, puedes asignar
          entrenadores a clases desde el módulo de clases.
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Dumbbell, MessageSquare, Shield, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTerminology } from "@/lib/sport-config/terminology";
import { pluralizeFirstWord } from "@/lib/specialization/registry";

interface SportDashboardItem {
  id: string;
  branchName: string;
  disciplineName: string;
  countryName: string;
  apparatusCount: number;
  programCount: number;
  athleteCount: number;
  groupCount: number;
  classCount: number;
  coachCount: number;
  licenseCount: number;
  messageCount: number;
  terminology?: Record<string, string>;
}

interface SportDashboardPayload {
  items: SportDashboardItem[];
  gaps: {
    athletesWithoutSportConfig: number;
    groupsWithoutSportConfig: number;
    classesWithoutSportConfig: number;
    coachesWithoutSportScope: number;
  };
}

interface SportConfigurationDashboardProps {
  academyId: string;
}

export function SportConfigurationDashboard({ academyId }: SportConfigurationDashboardProps) {
  const [data, setData] = useState<SportDashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/academies/${academyId}/sport-dashboard`, {
          headers: { "x-academy-id": academyId },
        });
        if (!response.ok) {
          setData(null);
          return;
        }
        const payload = await response.json();
        setData(payload.data ?? null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadDashboard();
  }, [academyId]);

  const totalGaps = useMemo(() => {
    if (!data) return 0;
    return (
      data.gaps.athletesWithoutSportConfig +
      data.gaps.groupsWithoutSportConfig +
      data.gaps.classesWithoutSportConfig +
      data.gaps.coachesWithoutSportScope
    );
  }, [data]);
  const fallbackTerms = useMemo(() => getTerminology(data?.items[0] ?? null), [data]);
  const fallbackCoachPlural = pluralizeFirstWord(fallbackTerms.coach);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Cargando estado deportivo...
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No se pudo cargar el estado deportivo de la academia.
        </CardContent>
      </Card>
    );
  }

  // Estado por rama como lista reglada: una fila por pendiente, en el idioma
  // de la academia y con su acción. Sin jerga interna («legacy», «scope»).
  const branchLower = fallbackTerms.branch.toLowerCase();
  const gapRows = [
    { key: "athletes", count: data.gaps.athletesWithoutSportConfig, text: `${fallbackTerms.athletes.toLowerCase()} sin ${branchLower} asignada`, href: `/app/${academyId}/settings`, action: `Asignar ${branchLower}` },
    { key: "groups", count: data.gaps.groupsWithoutSportConfig, text: `${fallbackTerms.groups.toLowerCase()} sin ${branchLower} asignada`, href: `/app/${academyId}/settings`, action: `Asignar ${branchLower}` },
    { key: "classes", count: data.gaps.classesWithoutSportConfig, text: `clases sin ${branchLower} asignada`, href: `/app/${academyId}/settings`, action: `Asignar ${branchLower}` },
    { key: "coaches", count: data.gaps.coachesWithoutSportScope, text: `${fallbackCoachPlural.toLowerCase()} disponibles en todas las ${branchLower}s`, href: `/app/${academyId}/coaches?sportConfigId=unscoped`, action: "Revisar" },
  ].filter((row) => row.count > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Estado por {branchLower}</CardTitle>
            <CardDescription>
              Comprueba que {fallbackTerms.athletes.toLowerCase()}, grupos, clases, licencias y comunicaciones están en su {branchLower}.
            </CardDescription>
          </div>
          <Badge variant={totalGaps > 0 ? "pending" : "active"}>
            {totalGaps > 0 ? `${totalGaps} ${totalGaps === 1 ? "pendiente" : "pendientes"}` : "Todo clasificado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {gapRows.length > 0 && (
          <ul className="border-y border-chalk-line">
            {gapRows.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-chalk-line py-3 last:border-b-0">
                <p className="text-sm text-mat-night">
                  <span className="font-display tabular mr-2 text-2xl font-black">{row.count}</span>
                  {row.text}
                </p>
                <Button asChild size="sm" variant="outline">
                  <a href={row.href}>{row.action}</a>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          {data.items.map((item) => (
            <SportDashboardBranchCard key={item.id} academyId={academyId} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SportDashboardBranchCard({
  academyId,
  item,
}: {
  academyId: string;
  item: SportDashboardItem;
}) {
  const terms = getTerminology(item);
  const apparatusLabelPlural = pluralizeFirstWord(terms.apparatus);
  const coachLabelPlural = pluralizeFirstWord(terms.coach);

  return (
    <div className="border-t-[3px] border-mat-night pt-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{item.branchName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.disciplineName} · {item.countryName}
                  </p>
                </div>
                <Badge variant="outline">{item.apparatusCount} {apparatusLabelPlural.toLowerCase()}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label={terms.athletes} value={item.athleteCount} icon={<Users className="h-4 w-4" />} />
                <Metric label={terms.groups} value={item.groupCount} icon={<Dumbbell className="h-4 w-4" />} />
                <Metric label="Clases" value={item.classCount} icon={<Dumbbell className="h-4 w-4" />} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label={coachLabelPlural} value={item.coachCount} icon={<Users className="h-4 w-4" />} />
                <Metric label={terms.license} value={item.licenseCount} icon={<Shield className="h-4 w-4" />} />
                <Metric label="Mensajes" value={item.messageCount} icon={<MessageSquare className="h-4 w-4" />} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/${academyId}/groups?sportConfigId=${item.id}`}>{terms.groups}</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/${academyId}/athletes?sportConfigId=${item.id}`}>{terms.athletes}</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/${academyId}/classes?sportConfigId=${item.id}`}>Clases</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/${academyId}/coaches?sportConfigId=${item.id}`}>{coachLabelPlural}</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/${academyId}/reports?sportConfigId=${item.id}`}>Reportes</a>
                </Button>
              </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-card px-2 py-3">
      <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center text-zaltyko-teal">
        {icon}
      </div>
      <p className="font-display text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

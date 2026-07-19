"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Dumbbell, MessageSquare, Shield, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTerminology } from "@/lib/sport-config/terminology";

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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-zaltyko-text-secondary">
          Cargando estado deportivo...
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-zaltyko-text-secondary">
          No se pudo cargar el estado deportivo de la academia.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Estado operativo por rama</CardTitle>
            <CardDescription>
              Revisa si atletas, grupos, clases, licencias y comunicaciones están alineados con las ramas activas.
            </CardDescription>
          </div>
          <Badge variant={totalGaps > 0 ? "pending" : "active"}>
            {totalGaps > 0 ? `${totalGaps} dato(s) sin rama` : "Sin gaps críticos"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalGaps > 0 && (
          <div className="rounded-xl border border-zaltyko-indigo/25 bg-zaltyko-indigo/10 p-4 text-sm text-zaltyko-indigo">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Datos legacy pendientes de clasificar</p>
                <p className="mt-1 text-zaltyko-text-secondary">
                  {fallbackTerms.athletes}: {data.gaps.athletesWithoutSportConfig} · {fallbackTerms.groups}: {data.gaps.groupsWithoutSportConfig} · Clases: {data.gaps.classesWithoutSportConfig} · {fallbackTerms.coach}s sin scope: {data.gaps.coachesWithoutSportScope}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <AuditLink
            label={`${fallbackTerms.athletes} sin ${fallbackTerms.branch.toLowerCase()}`}
            value={data.gaps.athletesWithoutSportConfig}
            href={`/app/${academyId}/settings`}
            action="Migrar"
          />
          <AuditLink
            label={`${fallbackTerms.groups} sin ${fallbackTerms.branch.toLowerCase()}`}
            value={data.gaps.groupsWithoutSportConfig}
            href={`/app/${academyId}/settings`}
            action="Migrar"
          />
          <AuditLink
            label="Clases sin rama"
            value={data.gaps.classesWithoutSportConfig}
            href={`/app/${academyId}/settings`}
            action="Migrar"
          />
          <AuditLink
            label="Coaches sin scope"
            value={data.gaps.coachesWithoutSportScope}
            href={`/app/${academyId}/coaches?sportConfigId=unscoped`}
            action="Revisar"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
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

  return (
    <div className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zaltyko-navy">{item.branchName}</p>
                  <p className="text-xs text-zaltyko-text-secondary">
                    {item.disciplineName} · {item.countryName}
                  </p>
                </div>
                <Badge variant="outline">{item.apparatusCount} {terms.apparatus.toLowerCase()}s</Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label={terms.athletes} value={item.athleteCount} icon={<Users className="h-4 w-4" />} />
                <Metric label={terms.groups} value={item.groupCount} icon={<Dumbbell className="h-4 w-4" />} />
                <Metric label="Clases" value={item.classCount} icon={<Dumbbell className="h-4 w-4" />} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label={`${terms.coach}s`} value={item.coachCount} icon={<Users className="h-4 w-4" />} />
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
                  <a href={`/app/${academyId}/coaches?sportConfigId=${item.id}`}>{terms.coach}s</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/${academyId}/reports?sportConfigId=${item.id}`}>Reportes</a>
                </Button>
              </div>
    </div>
  );
}

function AuditLink({
  label,
  value,
  href,
  action,
}: {
  label: string;
  value: number;
  href: string;
  action: string;
}) {
  const hasPending = value > 0;

  return (
    <div className={`rounded-xl border p-4 ${hasPending ? "border-zaltyko-indigo/25 bg-zaltyko-indigo/10" : "border-zaltyko-mist bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-text-secondary">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-zaltyko-navy">{value}</p>
      <Button asChild size="sm" variant="outline" className="mt-3" disabled={!hasPending}>
        <a href={href}>{action}</a>
      </Button>
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
    <div className="rounded-lg bg-white px-2 py-3">
      <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center text-zaltyko-teal">
        {icon}
      </div>
      <p className="font-display text-lg font-semibold text-zaltyko-navy">{value}</p>
      <p className="text-[11px] text-zaltyko-text-secondary">{label}</p>
    </div>
  );
}

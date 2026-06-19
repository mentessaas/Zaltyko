"use client";

import { useEffect, useMemo, useState } from "react";
import { Medal, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface SportConfigOption {
  id: string;
  branchName: string;
  disciplineName: string;
  terminology?: Record<string, string>;
  apparatus: Array<{ code: string; name: string }>;
}

interface CompetitionResult {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  sportConfigId: string | null;
  apparatus: string | null;
  dScore: number | null;
  eScore: number | null;
  finalScore: number | null;
  rank: number | null;
  round: string | null;
  subdivision: string | null;
  notes: string | null;
  createdAt: string | Date | null;
}

interface AthleteCompetitionHistoryProps {
  academyId: string;
  athleteId: string;
  sportConfigs: SportConfigOption[];
}

const formatScore = (value: number | null) => {
  if (value === null || value === undefined) return "-";
  return (value / 10).toFixed(1);
};

const formatDate = (value: string | Date | null) => {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-ES");
};

export function AthleteCompetitionHistory({
  academyId,
  athleteId,
  sportConfigs,
}: AthleteCompetitionHistoryProps) {
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [sportConfigFilter, setSportConfigFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const terms = getTerminologyForSportConfig(
    sportConfigs,
    sportConfigFilter === "all" ? null : sportConfigFilter
  );

  const sportConfigNameById = useMemo(
    () => new Map(sportConfigs.map((config) => [config.id, config.branchName])),
    [sportConfigs]
  );
  const apparatusNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    sportConfigs.forEach((config) => {
      config.apparatus.forEach((item) => map.set(item.code, item.name));
    });
    return map;
  }, [sportConfigs]);

  useEffect(() => {
    const loadResults = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/competition-results?athleteId=${athleteId}`, {
          headers: { "x-academy-id": academyId },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        setResults(response.ok ? payload.data?.items ?? [] : []);
      } finally {
        setIsLoading(false);
      }
    };

    void loadResults();
  }, [academyId, athleteId]);

  const filteredResults = useMemo(() => {
    if (sportConfigFilter === "all") return results;
    return results.filter((result) => result.sportConfigId === sportConfigFilter);
  }, [results, sportConfigFilter]);

  const podiumCount = results.filter((result) => result.rank && result.rank <= 3).length;
  const bestRank = results
    .map((result) => result.rank)
    .filter((rank): rank is number => typeof rank === "number")
    .sort((a, b) => a - b)[0];

  return (
    <section className="space-y-4 rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-teal">
            Historial de {terms.competition.toLowerCase()}
          </p>
          <h2 className="font-display text-lg font-semibold text-zaltyko-navy">
            Resultados por evento, rama y {terms.apparatus.toLowerCase()}
          </h2>
          <p className="text-sm text-zaltyko-text-secondary">
            Consulta resultados registrados desde {terms.competition.toLowerCase()}s y torneos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{results.length} resultados</Badge>
          <Badge variant="outline">{podiumCount} podios</Badge>
          {bestRank && <Badge variant="active">Mejor puesto #{bestRank}</Badge>}
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select
          value={sportConfigFilter}
          onChange={(event) => setSportConfigFilter(event.target.value)}
          className="h-10 rounded-lg border border-zaltyko-mist bg-white px-3 text-sm"
        >
          <option value="all">Todas las ramas</option>
          {sportConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.branchName} · {config.disciplineName}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" asChild>
          <a href={`/app/${academyId}/events`}>Ver eventos</a>
        </Button>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-dashed border-zaltyko-mist p-6 text-center text-sm text-zaltyko-text-secondary">
          Cargando resultados...
        </p>
      ) : filteredResults.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zaltyko-mist p-8 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-zaltyko-mist" />
          <p className="text-sm font-medium text-zaltyko-navy">Sin resultados registrados</p>
          <p className="mt-1 text-sm text-zaltyko-text-secondary">
            Cuando se guarden resultados en eventos o {terms.competition.toLowerCase()}s, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result) => (
            <article
              key={result.id}
              className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold text-zaltyko-navy">
                    {result.eventTitle ?? "Resultado sin evento"}
                  </p>
                  <p className="text-xs text-zaltyko-text-secondary">
                    {formatDate(result.createdAt)}
                    {result.round ? ` · ${result.round}` : ""}
                    {result.subdivision ? ` · ${result.subdivision}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.sportConfigId && (
                      <Badge variant="outline">
                        {sportConfigNameById.get(result.sportConfigId) ?? "Rama configurada"}
                      </Badge>
                    )}
                    {result.apparatus && (
                      <Badge variant="outline">
                        {apparatusNameByCode.get(result.apparatus) ?? result.apparatus}
                      </Badge>
                    )}
                  </div>
                </div>
                {result.rank && (
                  <div className="flex items-center gap-2 rounded-full bg-zaltyko-teal/10 px-3 py-1 text-sm font-semibold text-zaltyko-teal">
                    <Medal className="h-4 w-4" />
                    #{result.rank}
                  </div>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:max-w-md">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-zaltyko-text-secondary">D</p>
                  <p className="font-display text-lg font-semibold text-zaltyko-navy">{formatScore(result.dScore)}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-zaltyko-text-secondary">E</p>
                  <p className="font-display text-lg font-semibold text-zaltyko-navy">{formatScore(result.eScore)}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-zaltyko-text-secondary">Final</p>
                  <p className="font-display text-lg font-semibold text-zaltyko-navy">{formatScore(result.finalScore)}</p>
                </div>
              </div>
              {result.notes && (
                <p className="mt-3 text-sm text-zaltyko-text-secondary">{result.notes}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

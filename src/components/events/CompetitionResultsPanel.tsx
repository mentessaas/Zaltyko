"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTerminology } from "@/lib/sport-config/terminology";

interface AthleteOption {
  id: string;
  name: string;
  sportConfigId: string | null;
}

interface ApparatusOption {
  code: string;
  name: string;
}

interface CompetitionResult {
  id: string;
  athleteId: string;
  athleteName: string;
  apparatus: string | null;
  dScore: number | null;
  eScore: number | null;
  finalScore: number | null;
  rank: number | null;
  round: string | null;
  notes: string | null;
}

interface CompetitionResultsPanelProps {
  academyId: string;
  eventId: string;
  sportConfigId: string | null;
  sportConfigName: string | null;
  terminology?: Record<string, string>;
  apparatus: ApparatusOption[];
  athletes: AthleteOption[];
}

const scoreToInteger = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 10);
};

const formatScore = (value: number | null) => {
  if (value === null || value === undefined) return "-";
  return (value / 10).toFixed(1);
};

export function CompetitionResultsPanel({
  academyId,
  eventId,
  sportConfigId,
  sportConfigName,
  terminology,
  apparatus,
  athletes,
}: CompetitionResultsPanelProps) {
  const terms = getTerminology({ terminology });
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [apparatusCode, setApparatusCode] = useState("");
  const [round, setRound] = useState("");
  const [dScore, setDScore] = useState("");
  const [eScore, setEScore] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [rank, setRank] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const apparatusNameByCode = useMemo(
    () => new Map(apparatus.map((item) => [item.code, item.name])),
    [apparatus]
  );

  const filteredAthletes = useMemo(() => {
    if (!sportConfigId) return athletes;
    return athletes.filter((athlete) => !athlete.sportConfigId || athlete.sportConfigId === sportConfigId);
  }, [athletes, sportConfigId]);

  const fetchResults = async () => {
    const response = await fetch(`/api/competition-results?eventId=${eventId}`, {
      headers: { "x-academy-id": academyId },
    });
    if (!response.ok) return;
    const payload = await response.json();
    setResults(payload.data?.items ?? []);
  };

  useEffect(() => {
    void fetchResults();
  }, [eventId]);

  const resetForm = () => {
    setAthleteId("");
    setApparatusCode("");
    setRound("");
    setDScore("");
    setEScore("");
    setFinalScore("");
    setRank("");
    setNotes("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!athleteId) {
      setError(`Selecciona un ${terms.athlete.toLowerCase()}.`);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/competition-results", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify({
            athleteId,
            eventId,
            sportConfigId,
            apparatus: apparatusCode || undefined,
            round: round || undefined,
            dScore: scoreToInteger(dScore),
            eScore: scoreToInteger(eScore),
            finalScore: scoreToInteger(finalScore),
            rank: rank ? Number(rank) : undefined,
            notes: notes || undefined,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message ?? "No se pudo guardar el resultado.");
        }

        resetForm();
        await fetchResults();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el resultado.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-zaltyko-teal" />
              Resultados de {terms.competition.toLowerCase()}
            </CardTitle>
            <CardDescription>
              Registra resultados con {terms.apparatus.toLowerCase()}s y rama validados por configuración deportiva.
            </CardDescription>
          </div>
          {sportConfigName && <Badge variant="outline">{sportConfigName}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-6">
          {error && (
            <div className="rounded-lg border border-zaltyko-coral/30 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral md:col-span-6">
              {error}
            </div>
          )}
          <select
            value={athleteId}
            onChange={(event) => setAthleteId(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm md:col-span-2"
            required
          >
            <option value="">{terms.athlete}</option>
            {filteredAthletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.name}
              </option>
            ))}
          </select>
          <select
            value={apparatusCode}
            onChange={(event) => setApparatusCode(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm"
          >
            <option value="">{terms.apparatus}</option>
            {apparatus.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            value={round}
            onChange={(event) => setRound(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm"
            placeholder="Ronda"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            value={finalScore}
            onChange={(event) => setFinalScore(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm"
            placeholder="Nota final"
          />
          <input
            type="number"
            min="1"
            value={rank}
            onChange={(event) => setRank(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm"
            placeholder="Puesto"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            value={dScore}
            onChange={(event) => setDScore(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm"
            placeholder="D"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            value={eScore}
            onChange={(event) => setEScore(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm"
            placeholder="E"
          />
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm md:col-span-3"
            placeholder="Notas"
          />
          <Button type="submit" disabled={isPending} className="md:col-span-1">
            {isPending ? "Guardando" : "Guardar"}
          </Button>
        </form>

        {results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zaltyko-mist p-6 text-center text-sm text-zaltyko-text-secondary">
            Todavía no hay resultados registrados para este evento.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zaltyko-mist text-left text-xs uppercase text-zaltyko-text-secondary">
                <tr>
                  <th className="py-2 pr-4 font-medium">{terms.athlete}</th>
                  <th className="py-2 pr-4 font-medium">{terms.apparatus}</th>
                  <th className="py-2 pr-4 font-medium">Ronda</th>
                  <th className="py-2 pr-4 font-medium">D</th>
                  <th className="py-2 pr-4 font-medium">E</th>
                  <th className="py-2 pr-4 font-medium">Final</th>
                  <th className="py-2 pr-4 font-medium">Puesto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zaltyko-mist">
                {results.map((result) => (
                  <tr key={result.id}>
                    <td className="py-3 pr-4 font-medium text-zaltyko-navy">{result.athleteName}</td>
                    <td className="py-3 pr-4">
                      {result.apparatus ? apparatusNameByCode.get(result.apparatus) ?? result.apparatus : "-"}
                    </td>
                    <td className="py-3 pr-4">{result.round || "-"}</td>
                    <td className="py-3 pr-4">{formatScore(result.dScore)}</td>
                    <td className="py-3 pr-4">{formatScore(result.eScore)}</td>
                    <td className="py-3 pr-4 font-semibold">{formatScore(result.finalScore)}</td>
                    <td className="py-3 pr-4">{result.rank ? `#${result.rank}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  User,
  Calendar,
  Users,
  Trophy,
  Target,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AthleteProfileHeaderInfo } from "@/types/athletes";

interface AthleteProfileHeaderProps {
  athleteId: string;
  academyId: string;
  initialData?: AthleteProfileHeaderInfo | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-zaltyko-teal/10 text-zaltyko-teal border-zaltyko-teal/20",
  inactive: "bg-zaltyko-mist/30 text-zaltyko-text-secondary border-zaltyko-mist",
  suspended: "bg-zaltyko-coral/10 text-zaltyko-coral border-zaltyko-coral/20",
  pending: "bg-zaltyko-indigo/10 text-zaltyko-indigo border-zaltyko-indigo/20",
};

export function AthleteProfileHeader({
  athleteId,
  academyId,
  initialData,
}: AthleteProfileHeaderProps) {
  const [athlete, setAthlete] = useState<AthleteProfileHeaderInfo | null>(
    initialData ?? null
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setAthlete(initialData);
      setLoading(false);
      return;
    }

    const fetchAthlete = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/athletes/${athleteId}?academyId=${academyId}`
        );
        if (!response.ok) {
          throw new Error("No se pudo cargar el perfil del atleta.");
        }

        const data = await response.json();
        setAthlete(data.data);
      } catch (err) {
        setError((err as Error).message ?? "Error al cargar el perfil.");
      } finally {
        setLoading(false);
      }
    };

    fetchAthlete();
  }, [athleteId, academyId, initialData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-zaltyko-mist/40" />
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-zaltyko-mist/40" />
            <div className="h-4 w-32 animate-pulse rounded bg-zaltyko-mist/40" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !athlete) {
    return (
      <div className="rounded-2xl border border-zaltyko-coral/25 bg-zaltyko-coral/10 p-6 shadow-soft">
        <p className="text-sm text-zaltyko-coral">{error ?? "Atleta no encontrado."}</p>
      </div>
    );
  }

  const formatDob = (dob: string | null) => {
    if (!dob) return "Sin fecha";
    try {
      return format(new Date(dob), "d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return dob;
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
      <div className="zaltyko-motion-lines h-24 bg-zaltyko-navy" />

      <div className="px-6 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-zaltyko-teal text-2xl font-bold text-white shadow-soft">
            {athlete.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-bold text-zaltyko-navy">
                {athlete.name}
              </h1>
              <Badge
                className={STATUS_COLORS[athlete.status] ?? STATUS_COLORS.inactive}
              >
                {athlete.status}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zaltyko-text-secondary">
              {athlete.age !== null && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {athlete.age} años
                </span>
              )}
              {athlete.dob && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDob(athlete.dob)}
                </span>
              )}
              {athlete.groupName && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: athlete.groupColor ?? "#888" }}
                  />
                  {athlete.groupName}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {athlete.level && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zaltyko-teal/10 px-2 py-1 text-xs font-medium text-zaltyko-teal">
                  <Target className="h-3 w-3" />
                  Nivel {athlete.level}
                </span>
              )}
              {athlete.ageCategory && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zaltyko-indigo/10 px-2 py-1 text-xs font-medium text-zaltyko-indigo">
                  <Trophy className="h-3 w-3" />
                  {athlete.ageCategory}
                </span>
              )}
              {athlete.competitiveLevel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zaltyko-mist/30 px-2 py-1 text-xs font-medium text-zaltyko-text-secondary">
                  {athlete.competitiveLevel}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/app/${academyId}/athletes/${athleteId}/assessments`}
              >
                Evaluaciones
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/app/${academyId}/athletes/${athleteId}/documents`}
              >
                Documentos
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

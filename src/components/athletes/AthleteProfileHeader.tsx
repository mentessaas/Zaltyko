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
  active: "bg-green-100 text-green-800 border-green-200",
  inactive: "bg-gray-100 text-gray-800 border-gray-200",
  suspended: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
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
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !athlete) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm text-red-700">{error ?? "Atleta no encontrado."}</p>
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
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header gradient */}
      <div className="h-24 bg-gradient-to-r from-zaltyko-primary/20 via-zaltyko-primary-light/20 to-zaltyko-primary/20" />

      <div className="px-6 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8">
          {/* Avatar */}
          <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white text-2xl font-bold shadow-lg border-4 border-card">
            {athlete.name.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {athlete.name}
              </h1>
              <Badge
                className={STATUS_COLORS[athlete.status] ?? "bg-gray-100 text-gray-800"}
              >
                {athlete.status}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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

            {/* Additional info */}
            <div className="mt-2 flex flex-wrap gap-2">
              {athlete.level && (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                  <Target className="h-3 w-3" />
                  Nivel {athlete.level}
                </span>
              )}
              {athlete.ageCategory && (
                <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                  <Trophy className="h-3 w-3" />
                  {athlete.ageCategory}
                </span>
              )}
              {athlete.competitiveLevel && (
                <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
                  {athlete.competitiveLevel}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
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

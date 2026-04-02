"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, UserMinus, AlertCircle, Search } from "lucide-react";

interface EnrollmentItem {
  id: string;
  athleteId: string;
  athleteName: string;
  athleteLevel: string | null;
  enrolledAt: string;
}

interface AthleteOption {
  id: string;
  name: string;
  level: string | null;
}

interface EnrollmentManagerProps {
  classId: string;
  className: string;
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function EnrollmentManager({
  classId,
  className,
  open,
  onClose,
  onRefresh,
}: EnrollmentManagerProps) {
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [availableAthletes, setAvailableAthletes] = useState<AthleteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Cargar inscripciones
  const fetchEnrollments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (user?.id) {
        headers["x-user-id"] = user.id;
      }

      const response = await fetch(`/api/class-enrollments?classId=${classId}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error("Error al cargar inscripciones");
      }

      const data = await response.json();
      setEnrollments(
        (data.items ?? []).map((item: any) => ({
          id: item.id,
          athleteId: item.athleteId,
          athleteName: item.athleteName ?? "Sin nombre",
          athleteLevel: item.athleteLevel,
          enrolledAt: item.createdAt,
        }))
      );
    } catch (err: any) {
      console.error("Error fetching enrollments:", err);
      setError(err.message ?? "Error al cargar las inscripciones");
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  // Cargar atletas disponibles (para añadir)
  const fetchAvailableAthletes = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (user?.id) {
        headers["x-user-id"] = user.id;
      }

      // Obtener atletas del tenant (limitado para evitar sobrecarga)
      const response = await fetch("/api/athletes?limit=100", {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error("Error al cargar atletas");
      }

      const data = await response.json();
      const enrolledAthleteIds = new Set(enrollments.map((e) => e.athleteId));

      setAvailableAthletes(
        (data.items ?? [])
          .filter((athlete: any) => !enrolledAthleteIds.has(athlete.id))
          .map((athlete: any) => ({
            id: athlete.id,
            name: athlete.name,
            level: athlete.level,
          }))
      );
    } catch (err: any) {
      console.error("Error fetching athletes:", err);
    }
  }, [enrollments]);

  useEffect(() => {
    if (open) {
      fetchEnrollments();
      fetchAvailableAthletes();
    }
  }, [open, fetchEnrollments, fetchAvailableAthletes]);

  // Inscribir atleta
  const handleEnroll = async (athleteId: string) => {
    setIsEnrolling(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (user?.id) {
        headers["x-user-id"] = user.id;
      }

      const response = await fetch("/api/class-enrollments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          classId,
          athleteId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al inscribir");
      }

      // Refrescar listas
      await fetchEnrollments();
      await fetchAvailableAthletes();
      onRefresh?.();
    } catch (err: any) {
      console.error("Error enrolling athlete:", err);
      setError(err.message ?? "Error al inscribir");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Desinscribir atleta
  const handleUnenroll = async (enrollmentId: string, athleteName: string) => {
    if (!confirm(`¿Quitar a ${athleteName} de esta clase?`)) {
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (user?.id) {
          headers["x-user-id"] = user.id;
        }

        const response = await fetch(`/api/class-enrollments/${enrollmentId}`, {
          method: "DELETE",
          headers,
        });

        if (!response.ok) {
          throw new Error("Error al desinscribir");
        }

        // Refrescar listas
        await fetchEnrollments();
        await fetchAvailableAthletes();
        onRefresh?.();
      } catch (err: any) {
        setError(err.message ?? "Error al desinscribir");
      }
    });
  };

  const filteredAthletes = availableAthletes.filter(
    (athlete) =>
      athlete.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      athlete.level?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gestionar inscripciones"
      description={`Inscribir atletas adicionales en "${className}"`}
      widthClassName="max-w-lg"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        )}

        {/* Sección: Añadir atleta */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Añadir atleta</h3>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar atleta por nombre o nivel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {isEnrolling ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAthletes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {searchQuery
                ? "No hay atletas que coincidan con la búsqueda"
                : "No hay atletas disponibles para añadir"}
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-md border">
              {filteredAthletes.slice(0, 20).map((athlete) => (
                <div
                  key={athlete.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{athlete.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {athlete.level ?? "Sin nivel"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnroll(athlete.id)}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                  >
                    <UserPlus className="mr-1 inline h-3 w-3" />
                    Inscribir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección: Inscritos actuales */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            Inscritos actualmente ({enrollments.length})
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No hay atletas inscritos en esta clase
              </p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-md border">
              {enrollments.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{enrollment.athleteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {enrollment.athleteLevel ?? "Sin nivel"} • Inscrito el{" "}
                      {new Date(enrollment.enrolledAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleUnenroll(enrollment.id, enrollment.athleteName)
                    }
                    disabled={isPending}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    <UserMinus className="mr-1 inline h-3 w-3" />
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

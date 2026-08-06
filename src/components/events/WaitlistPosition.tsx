"use client";

import { useState } from "react";
import { Clock, AlertCircle, CheckCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface WaitlistPositionProps {
  eventId: string;
  profileId: string;
  maxSize?: number | null;
  onRegister?: (profileId: string) => Promise<void>;
  onCancel?: (profileId: string) => Promise<void>;
}

interface WaitlistEntry {
  id: string;
  position: number;
  profileId: string;
  profileName?: string;
  addedAt: string;
}

export function WaitlistPosition({
  eventId,
  profileId,
  maxSize,
  onRegister,
  onCancel,
}: WaitlistPositionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOnWaitlist = false; // This would be determined by API data
  const currentPosition = null; // This would come from API
  const totalInWaitlist: number = 0; // This would come from API

  const handleJoinWaitlist = async () => {
    if (!onRegister) return;

    setLoading(true);
    setError(null);

    try {
      await onRegister(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al unirse a la lista de espera");
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    if (!onCancel) return;

    setLoading(true);
    setError(null);

    try {
      await onCancel(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abandonar la lista de espera");
    } finally {
      setLoading(false);
    }
  };

  if (isOnWaitlist && currentPosition !== null) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Lista de Espera
            </CardTitle>
            <Badge variant="pending">#{currentPosition}</Badge>
          </div>
          <CardDescription>
            {totalInWaitlist} persona{totalInWaitlist !== 1 ? "s" : ""} en lista de espera
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Estás en posición <span className="font-semibold text-amber-700">#{currentPosition}</span> de la lista de espera.
            Te notificaremos cuando haya un lugar disponible.
          </p>

          {maxSize && (
            <p className="text-xs text-muted-foreground mb-4">
              La lista de espera tiene un máximo de {maxSize} lugares.
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive mb-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveWaitlist}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Abandonando..." : "Abandonar lista de espera"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Not on waitlist view
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Lista de Espera
        </CardTitle>
        <CardDescription>
          {maxSize
            ? `Máximo ${maxSize} lugares en la lista`
            : "Sin límite de lugares"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalInWaitlist > 0 && (
          <p className="text-sm text-muted-foreground mb-4">
            Hay {totalInWaitlist} persona{totalInWaitlist !== 1 ? "s" : ""} esperando un lugar.
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <Button
          onClick={handleJoinWaitlist}
          disabled={loading || (maxSize !== null && maxSize !== undefined && totalInWaitlist >= maxSize)}
          className="w-full"
        >
          {loading ? "Uniéndose..." : "Unirse a la lista de espera"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function WaitlistPositionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

interface WaitlistListProps {
  entries: WaitlistEntry[];
  eventId: string;
  onRemove?: (entryId: string) => Promise<void>;
  isLoading?: boolean;
}

export function WaitlistList({ entries, onRemove, isLoading }: WaitlistListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No hay nadie en la lista de espera</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-semibold text-sm">
                #{entry.position}
              </div>
              <div>
                <p className="font-medium">
                  {entry.profileName || "Participante"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Agregado el {new Date(entry.addedAt).toLocaleDateString("es-ES")}
                </p>
              </div>
            </div>

            {onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(entry.id)}
                className="text-destructive hover:text-destructive"
              >
                Eliminar
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

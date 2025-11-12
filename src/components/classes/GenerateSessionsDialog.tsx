"use client";

import { useState } from "react";
import { Calendar, Loader2, Plus } from "lucide-react";
import { format, addDays, differenceInDays, getDay } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

interface GenerateSessionsDialogProps {
  classId: string;
  className: string;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

export function GenerateSessionsDialog({
  classId,
  className,
  weekday,
  startTime,
  endTime,
  open,
  onClose,
  onGenerated,
}: GenerateSessionsDialogProps) {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return format(today, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const nextMonth = addDays(today, 30);
    return format(nextMonth, "yyyy-MM-dd");
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const calculatePreview = () => {
    if (!startDate || !endDate || weekday === null || weekday === undefined) {
      setPreview(null);
      return;
    }

    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        setPreview(null);
        return;
      }

      // Calcular cuántas sesiones se generarán
      let count = 0;
      let currentDate = new Date(start);
      const targetWeekday = weekday;

      // Encontrar la primera fecha que coincide con el weekday
      const startWeekday = getDay(currentDate);
      const targetDay = targetWeekday === 0 ? 7 : targetWeekday;
      const currentDay = startWeekday === 0 ? 7 : startWeekday;
      let daysToAdd = (targetDay - currentDay + 7) % 7;

      if (daysToAdd === 0 && startWeekday !== targetWeekday) {
        daysToAdd = 7;
      }

      currentDate = addDays(currentDate, daysToAdd);

      if (currentDate < start) {
        currentDate = addDays(currentDate, 7);
      }

      while (currentDate <= end) {
        count++;
        currentDate = addDays(currentDate, 7);
      }

      setPreview(count);
    } catch {
      setPreview(null);
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setError(null);
    setTimeout(calculatePreview, 100);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setError(null);
    setTimeout(calculatePreview, 100);
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      setError("Selecciona un rango de fechas válido");
      return;
    }

    if (weekday === null || weekday === undefined) {
      setError("Esta clase no tiene un día de la semana configurado");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError("Fechas inválidas");
      return;
    }

    if (start > end) {
      setError("La fecha de inicio debe ser anterior a la fecha de fin");
      return;
    }

    const daysDiff = differenceInDays(end, start);
    if (daysDiff > 365) {
      setError("El rango máximo es de 365 días (1 año)");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/classes/${classId}/generate-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classId,
          startDate: start.toISOString().split("T")[0],
          endDate: end.toISOString().split("T")[0],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al generar sesiones");
      }

      onGenerated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al generar sesiones");
    } finally {
      setIsGenerating(false);
    }
  };

  if (weekday === null || weekday === undefined) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar sesiones recurrentes</DialogTitle>
            <DialogDescription>
              Esta clase no tiene un día de la semana configurado. Configura el día de la semana en
              la clase antes de generar sesiones recurrentes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generar sesiones recurrentes</DialogTitle>
          <DialogDescription>
            Genera sesiones automáticamente para <strong>{className}</strong> basándote en el día de
            la semana configurado ({WEEKDAY_LABELS[weekday]}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Fecha de inicio</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">Fecha de fin</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          {preview !== null && preview > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">
                Se generarán aproximadamente <strong>{preview} sesiones</strong> para los{" "}
                {WEEKDAY_LABELS[weekday]}s en el rango seleccionado.
              </p>
              {startTime && endTime && (
                <p className="mt-1 text-xs text-blue-700">
                  Horario: {startTime} – {endTime}
                </p>
              )}
            </div>
          )}

          {preview === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>No se generarán sesiones en el rango seleccionado.</p>
              <p className="mt-1 text-xs text-amber-700">
                Asegúrate de que el rango incluya al menos un {WEEKDAY_LABELS[weekday]}.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || preview === 0}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Generar sesiones
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


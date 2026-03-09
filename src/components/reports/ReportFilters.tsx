"use client";

import { useState, useEffect } from "react";
import { Calendar, Filter, Loader2, X } from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterOption {
  value: string;
  label: string;
}

interface ReportFiltersProps {
  onFilterChange: (filters: ReportFilters) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  showClassFilter?: boolean;
  showGroupFilter?: boolean;
  showCoachFilter?: boolean;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  classId?: string;
  groupId?: string;
  coachId?: string;
  datePreset?: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
}

interface CoachOption {
  id: string;
  name: string;
}

export function ReportFilters({
  onFilterChange,
  onGenerate,
  isLoading = false,
  showClassFilter = false,
  showGroupFilter = false,
  showCoachFilter = false,
}: ReportFiltersProps) {
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: format(subMonths(new Date(), 1), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    datePreset: "last-30-days",
  });

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  useEffect(() => {
    const fetchOptions = async () => {
      setIsLoadingOptions(true);
      try {
        // In production, fetch from API
        // Simulated data for now
        if (showClassFilter) {
          setClasses([
            { id: "1", name: "Karate Principiantes" },
            { id: "2", name: "Karate Intermedio" },
            { id: "3", name: "Karate Avanzado" },
          ]);
        }
        if (showGroupFilter) {
          setGroups([
            { id: "1", name: "Grupo A" },
            { id: "2", name: "Grupo B" },
          ]);
        }
        if (showCoachFilter) {
          setCoaches([
            { id: "1", name: "Juan Pérez" },
            { id: "2", name: "María García" },
          ]);
        }
      } catch (error) {
        console.error("Error fetching filter options:", error);
      } finally {
        setIsLoadingOptions(false);
      }
    };

    fetchOptions();
  }, [showClassFilter, showGroupFilter, showCoachFilter]);

  const handleDatePresetChange = (preset: string) => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (preset) {
      case "today":
        startDate = now;
        break;
      case "yesterday":
        startDate = subDays(now, 1);
        endDate = subDays(now, 1);
        break;
      case "last-7-days":
        startDate = subDays(now, 7);
        break;
      case "last-30-days":
        startDate = subDays(now, 30);
        break;
      case "last-90-days":
        startDate = subMonths(now, 3);
        break;
      case "this-month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last-month":
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "this-year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = subMonths(now, 1);
    }

    const newFilters = {
      ...filters,
      datePreset: preset,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleFilterChange = (key: keyof ReportFilters, value: string) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const defaultFilters: ReportFilters = {
      startDate: format(subMonths(new Date(), 1), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
      datePreset: "last-30-days",
    };
    setFilters(defaultFilters);
    onFilterChange(defaultFilters);
  };

  const hasActiveFilters =
    filters.classId ||
    filters.groupId ||
    filters.coachId ||
    filters.datePreset !== "last-30-days";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Preset */}
        <div className="space-y-2">
          <Label>Periodo Predefinido</Label>
          <Select
            value={filters.datePreset}
            onValueChange={handleDatePresetChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="yesterday">Ayer</SelectItem>
              <SelectItem value="last-7-days">Últimos 7 días</SelectItem>
              <SelectItem value="last-30-days">Últimos 30 días</SelectItem>
              <SelectItem value="last-90-days">Últimos 90 días</SelectItem>
              <SelectItem value="this-month">Este mes</SelectItem>
              <SelectItem value="last-month">Mes pasado</SelectItem>
              <SelectItem value="this-year">Este año</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom Date Range */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start-date">Fecha Inicio</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="start-date"
                type="date"
                className="pl-10"
                value={filters.startDate}
                onChange={(e) => handleFilterChange("startDate", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">Fecha Fin</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="end-date"
                type="date"
                className="pl-10"
                value={filters.endDate}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Additional Filters */}
        {showClassFilter && (
          <div className="space-y-2">
            <Label>Clase</Label>
            <Select
              value={filters.classId || ""}
              onValueChange={(value) => handleFilterChange("classId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas las clases" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="">Todas las clases</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {showGroupFilter && (
          <div className="space-y-2">
            <Label>Grupo</Label>
            <Select
              value={filters.groupId || ""}
              onValueChange={(value) => handleFilterChange("groupId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos los grupos" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="">Todos los grupos</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {showCoachFilter && (
          <div className="space-y-2">
            <Label>Entrenador</Label>
            <Select
              value={filters.coachId || ""}
              onValueChange={(value) => handleFilterChange("coachId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos los entrenadores" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="">Todos los entrenadores</SelectItem>
                    {coaches.map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={onGenerate} disabled={isLoading} className="flex-1">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              "Generar Reporte"
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

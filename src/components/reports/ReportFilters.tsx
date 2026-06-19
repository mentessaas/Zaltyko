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
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface FilterOption {
  value: string;
  label: string;
}

interface ReportFiltersProps {
  academyId: string;
  onFilterChange: (filters: ReportFilters) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  showClassFilter?: boolean;
  showGroupFilter?: boolean;
  showCoachFilter?: boolean;
  showAthleteFilter?: boolean;
  showSportConfigFilter?: boolean;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  athleteId?: string;
  classId?: string;
  groupId?: string;
  coachId?: string;
  sportConfigId?: string;
  datePreset?: string;
}

interface ClassOption {
  id: string;
  name: string;
  technicalFocus?: string | null;
  apparatus?: string[];
}

interface GroupOption {
  id: string;
  name: string;
  technicalFocus?: string | null;
  apparatus?: string[];
  sessionBlocks?: string[];
}

interface CoachOption {
  id: string;
  name: string;
}

interface AthleteOption {
  id: string;
  name: string;
}

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  terminology?: Record<string, string>;
}

export function ReportFilters({
  academyId,
  onFilterChange,
  onGenerate,
  isLoading = false,
  showClassFilter = false,
  showGroupFilter = false,
  showCoachFilter = false,
  showAthleteFilter = false,
  showSportConfigFilter = false,
}: ReportFiltersProps) {
  const { specialization } = useAcademyContext();
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: format(subMonths(new Date(), 1), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    datePreset: "last-30-days",
  });

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [sportConfigs, setSportConfigs] = useState<SportConfigOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const terms = getTerminologyForSportConfig(sportConfigs, filters.sportConfigId);
  const athletesTermLower = terms.athletes.toLowerCase();
  const groupsTermLower = terms.groups.toLowerCase();
  const coachTermLower = terms.coach.toLowerCase();
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );

  useEffect(() => {
    const fetchOptions = async () => {
      setIsLoadingOptions(true);
      try {
        const response = await fetch(`/api/reports/filter-options?academyId=${academyId}`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || payload.error || "No se pudieron cargar los filtros");
        }

        const data = payload.data ?? {};
        setClasses(Array.isArray(data.classes) ? data.classes : []);
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        setCoaches(Array.isArray(data.coaches) ? data.coaches : []);
        setAthletes(Array.isArray(data.athletes) ? data.athletes : []);
        setSportConfigs(Array.isArray(data.sportConfigs) ? data.sportConfigs : []);
      } catch (error) {
        console.error("Error fetching filter options:", error);
        setClasses([]);
        setGroups([]);
        setCoaches([]);
        setAthletes([]);
        setSportConfigs([]);
      } finally {
        setIsLoadingOptions(false);
      }
    };

    fetchOptions();
  }, [academyId, showAthleteFilter, showClassFilter, showCoachFilter, showGroupFilter, showSportConfigFilter]);

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
      [key]: !value || value === "all" ? undefined : value,
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
    filters.athleteId ||
    filters.classId ||
    filters.groupId ||
    filters.coachId ||
    filters.sportConfigId ||
    filters.datePreset !== "last-30-days";

  const formatOptionMeta = (item: {
    technicalFocus?: string | null;
    apparatus?: string[];
    sessionBlocks?: string[];
  }) => {
    const metadata = [
      item.technicalFocus?.trim() || null,
      ...(item.apparatus ?? []).slice(0, 2).map((value) => apparatusLabels[value] || value),
      ...(item.sessionBlocks ?? []).slice(0, 1),
    ].filter(Boolean);

    return metadata.length > 0 ? metadata.join(" · ") : null;
  };

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
        {showSportConfigFilter && (
          <div className="space-y-2">
            <Label>Rama / modalidad</Label>
            <Select
              value={filters.sportConfigId || "all"}
              onValueChange={(value) => handleFilterChange("sportConfigId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas las ramas" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="all">Todas</SelectItem>
                    {sportConfigs.map((config) => (
                      <SelectItem key={config.id} value={config.id}>
                        {config.branchName} · {config.disciplineName}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {showAthleteFilter && (
          <div className="space-y-2">
            <Label>{terms.athlete}</Label>
            <Select
              value={filters.athleteId || "all"}
              onValueChange={(value) => handleFilterChange("athleteId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Todos los ${athletesTermLower}`} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="all">Todos</SelectItem>
                    {athletes.map((athlete) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {showClassFilter && (
          <div className="space-y-2">
            <Label>{specialization.labels.classLabel}</Label>
            <Select
              value={filters.classId || "all"}
              onValueChange={(value) => handleFilterChange("classId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Todos los ${specialization.labels.classLabel.toLowerCase()}s`} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="all">Todos</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {[cls.name, formatOptionMeta(cls)].filter(Boolean).join(" · ")}
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
            <Label>{terms.group}</Label>
            <Select
              value={filters.groupId || "all"}
              onValueChange={(value) => handleFilterChange("groupId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Todos los ${groupsTermLower}`} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="all">Todos</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {[group.name, formatOptionMeta(group)].filter(Boolean).join(" · ")}
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
            <Label>{terms.coach}</Label>
            <Select
              value={filters.coachId || "all"}
              onValueChange={(value) => handleFilterChange("coachId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Todos los ${coachTermLower}s`} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <SelectItem value="all">Todos</SelectItem>
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

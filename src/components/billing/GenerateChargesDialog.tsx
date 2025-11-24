"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { z } from "zod";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toast-provider";
import { es } from "date-fns/locale";

interface GroupOption {
  id: string;
  name: string;
  color: string | null;
}

interface GenerateChargesDialogProps {
  academyId: string;
  groups: GroupOption[];
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

const formSchema = z.object({
  scope: z.enum(["all", "group"]),
  groupId: z.string().uuid().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato YYYY-MM"),
  skipDuplicates: z.boolean().default(true),
});

export function GenerateChargesDialog({
  academyId,
  groups,
  open,
  onClose,
  onGenerated,
}: GenerateChargesDialogProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [scope, setScope] = useState<"all" | "group">("all");
  const [groupId, setGroupId] = useState<string>("");
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper para formatear periodo a nombre de mes en español
  const formatPeriodToMonthName = (periodStr: string): string => {
    const [year, month] = periodStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return format(date, "MMMM yyyy", { locale: es });
  };

  useEffect(() => {
    if (open) {
      setScope("all");
      setGroupId("");
      const now = new Date();
      setPeriod(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      setSkipDuplicates(true);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const formData = {
      scope,
      groupId: scope === "group" ? groupId : undefined,
      period,
      skipDuplicates,
    };

    const validation = formSchema.safeParse(formData);
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || "Error de validación.");
      return;
    }

    if (scope === "group" && !groupId) {
      setError("Debes seleccionar un grupo.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/charges/generate-monthly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            academyId,
            groupId: scope === "group" ? groupId : null,
            period: validation.data.period,
            skipDuplicates: validation.data.skipDuplicates,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Error al generar cargos.");
        }

        const data = await res.json();
        toast.pushToast({
          title: "Cargos generados",
          description: `Se generaron ${data.created} cargo${data.created === 1 ? "" : "s"}. ${data.skipped > 0 ? `${data.skipped} ya existían.` : ""}`,
          variant: "success",
        });
        onGenerated();
        onClose();
      } catch (err: any) {
        setError(err.message || "Error desconocido al generar cargos.");
      }
    });
  };

  return (
    <Modal
      title="Generar cargos de este mes"
      description="Genera cargos mensuales automáticamente para los atletas activos basándote en las cuotas de sus grupos."
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="generate-charges-form" disabled={isPending || (scope === "group" && !groupId)}>
            {isPending ? "Generando..." : "Generar cargos"}
          </Button>
        </div>
      }
    >
      <form id="generate-charges-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Label className="mb-3 block text-sm font-medium">Ámbito de generación</Label>
          <RadioGroup value={scope} onValueChange={(value) => setScope(value as "all" | "group")}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="scope-all" />
              <Label htmlFor="scope-all" className="font-normal cursor-pointer">
                Toda la academia
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="group" id="scope-group" />
              <Label htmlFor="scope-group" className="font-normal cursor-pointer">
                Solo un grupo
              </Label>
            </div>
          </RadioGroup>
        </div>

        {scope === "group" && (
          <div>
            <Label htmlFor="groupId" className="mb-1 block text-sm font-medium">
              Grupo <span className="text-destructive">*</span>
            </Label>
            <Select value={groupId} onValueChange={setGroupId} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">No hay grupos disponibles.</div>
                ) : (
                  groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="period" className="mb-1 block text-sm font-medium">
            Periodo <span className="text-destructive">*</span>
          </Label>
          <Input
            id="period"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={isPending}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {period ? `Se generarán cargos para ${formatPeriodToMonthName(period)}` : ""}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="skipDuplicates"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            disabled={isPending}
          />
          <Label htmlFor="skipDuplicates" className="text-sm font-normal cursor-pointer">
            No duplicar cargos existentes
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Si está marcado, no se crearán cargos si ya existe uno de tipo «cuota mensual» para el mismo atleta y periodo.
        </p>
      </form>
    </Modal>
  );
}


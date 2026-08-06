"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface AthleteOption {
  id: string;
  name: string;
  primarySportConfigId: string | null;
}

interface SportConfigOption {
  id: string;
  branchName: string;
  disciplineName: string;
  terminology?: Record<string, string>;
}

interface CreateLicenseDialogProps {
  academyId: string;
  athletes: AthleteOption[];
  sportConfigs: SportConfigOption[];
}

const todayInputValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

export function CreateLicenseDialog({
  academyId,
  athletes,
  sportConfigs,
}: CreateLicenseDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [personId, setPersonId] = useState("");
  const [sportConfigId, setSportConfigId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [federation, setFederation] = useState("");
  const [validFrom, setValidFrom] = useState(todayInputValue);
  const [validUntil, setValidUntil] = useState("");
  const [medicalCertificateExpiry, setMedicalCertificateExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sportConfigNameById = useMemo(
    () => new Map(sportConfigs.map((config) => [config.id, `${config.branchName} · ${config.disciplineName}`])),
    [sportConfigs]
  );

  const selectedAthlete = athletes.find((athlete) => athlete.id === personId);
  const effectiveSportConfigId = sportConfigId || selectedAthlete?.primarySportConfigId || null;
  const terms = getTerminologyForSportConfig(sportConfigs, effectiveSportConfigId);
  const licenseTermLower = terms.license.toLowerCase();
  const athleteTermLower = terms.athlete.toLowerCase();
  const inheritedSportConfigName = selectedAthlete?.primarySportConfigId
    ? sportConfigNameById.get(selectedAthlete.primarySportConfigId) ?? "rama principal"
    : null;

  useEffect(() => {
    if (!open) return;

    setPersonId("");
    setSportConfigId("");
    setLicenseNumber("");
    setLicenseType("");
    setFederation("");
    setValidFrom(todayInputValue());
    setValidUntil("");
    setMedicalCertificateExpiry("");
    setNotes("");
    setError(null);
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!personId) {
      setError(`Selecciona un ${athleteTermLower}.`);
      return;
    }

    if (!licenseNumber.trim() || !licenseType.trim() || !federation.trim()) {
      setError(`Completa número, tipo de ${licenseTermLower} y federación.`);
      return;
    }

    if (!validFrom || !validUntil) {
      setError("Indica el periodo de validez.");
      return;
    }

    if (new Date(validUntil) < new Date(validFrom)) {
      setError("La fecha de caducidad no puede ser anterior al inicio.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/licenses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify({
            personId,
            personType: "athlete",
            sportConfigId: sportConfigId || null,
            licenseNumber: licenseNumber.trim(),
            licenseType: licenseType.trim(),
            federation: federation.trim(),
            validFrom,
            validUntil,
            medicalCertificateExpiry: medicalCertificateExpiry || undefined,
            notes: notes.trim() || undefined,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message ?? `No se pudo crear la ${licenseTermLower}.`);
        }

        toast.pushToast({
          title: `${terms.license} creada`,
          description: `La ${licenseTermLower} se guardó con la rama/modalidad correspondiente.`,
          variant: "success",
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `No se pudo crear la ${licenseTermLower}.`);
      }
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={athletes.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        Nueva {licenseTermLower}
      </Button>

      <Modal
        title={`Nueva ${licenseTermLower}`}
        description={`Registra una ${licenseTermLower} vinculada al ${athleteTermLower} y a su rama/modalidad activa.`}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="create-license-form" disabled={isPending}>
              {isPending ? "Guardando..." : `Guardar ${licenseTermLower}`}
            </Button>
          </div>
        }
      >
        <form id="create-license-form" onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg border border-zaltyko-coral/30 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral">
              {error}
            </p>
          )}

          <div>
            <Label htmlFor="license-athlete" className="mb-1 block text-sm font-medium">
              {terms.athlete}
            </Label>
            <select
              id="license-athlete"
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Selecciona {athleteTermLower}</option>
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="license-sport-config" className="mb-1 block text-sm font-medium">
              Rama/modalidad
            </Label>
            <select
              id="license-sport-config"
              value={sportConfigId}
              onChange={(event) => setSportConfigId(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                {inheritedSportConfigName ? `Heredar del ${athleteTermLower} (${inheritedSportConfigName})` : "Sin rama específica"}
              </option>
              {sportConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.branchName} · {config.disciplineName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="license-number" className="mb-1 block text-sm font-medium">
                Número
              </Label>
              <Input
                id="license-number"
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="license-type" className="mb-1 block text-sm font-medium">
                Tipo
              </Label>
              <Input
                id="license-type"
                value={licenseType}
                onChange={(event) => setLicenseType(event.target.value)}
                placeholder="Federativa, autonómica..."
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="license-federation" className="mb-1 block text-sm font-medium">
              Federación
            </Label>
            <Input
              id="license-federation"
              value={federation}
              onChange={(event) => setFederation(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="license-valid-from" className="mb-1 block text-sm font-medium">
                Inicio
              </Label>
              <Input
                id="license-valid-from"
                type="date"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="license-valid-until" className="mb-1 block text-sm font-medium">
                Caducidad
              </Label>
              <Input
                id="license-valid-until"
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="license-medical" className="mb-1 block text-sm font-medium">
                Certificado médico
              </Label>
              <Input
                id="license-medical"
                type="date"
                value={medicalCertificateExpiry}
                onChange={(event) => setMedicalCertificateExpiry(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="license-notes" className="mb-1 block text-sm font-medium">
              Notas
            </Label>
            <textarea
              id="license-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </form>
      </Modal>
    </>
  );
}

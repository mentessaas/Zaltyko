"use client";

import { FormEvent, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface CreateCoachDialogProps {
  academyId: string;
  sportConfigs: SportConfigOption[];
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  terminology?: Record<string, string>;
}

export function CreateCoachDialog({ academyId, sportConfigs, open, onClose, onCreated }: CreateCoachDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedSportConfigs, setSelectedSportConfigs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const terms = getTerminologyForSportConfig(sportConfigs, selectedSportConfigs[0]);
  const coachTermLower = terms.coach.toLowerCase();

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setSelectedSportConfigs([]);
    setError(null);
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(`El nombre del ${coachTermLower} es obligatorio.`);
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        const payload = {
          academyId,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          sportConfigIds: selectedSportConfigs,
        };

        const response = await fetch("/api/coaches", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? `No se pudo crear el ${coachTermLower}.`);
        }

        resetForm();
        onCreated();
        onClose();
      } catch (err: unknown) {
        setError(err.message ?? `Error desconocido al crear el ${coachTermLower}.`);
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Registrar nuevo ${coachTermLower}`}
      description={`Invita a ${coachTermLower}s, asistentes o personal de apoyo para que gestionen clases.`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="create-coach-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : `Guardar ${coachTermLower}`}
          </button>
        </div>
      }
    >
      <form id="create-coach-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Nombre</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Ej. Marta Fernández"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Correo</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="marta@academia.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Teléfono</label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="+34 612 345 678"
          />
        </div>
        <section className="space-y-3 rounded-md border border-dashed border-border/70 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Ramas habilitadas</h3>
            <p className="text-xs text-muted-foreground">
              Si no marcas ninguna, el {coachTermLower} queda disponible para todas las ramas.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sportConfigs.map((config) => (
              <label
                key={config.id}
                className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm hover:border-primary/60"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedSportConfigs.includes(config.id)}
                  onChange={() =>
                    setSelectedSportConfigs((current) =>
                      current.includes(config.id)
                        ? current.filter((id) => id !== config.id)
                        : [...current, config.id]
                    )
                  }
                />
                <span>
                  <span className="block font-medium">{config.branchName}</span>
                  <span className="block text-xs text-muted-foreground">{config.disciplineName}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </form>
    </Modal>
  );
}

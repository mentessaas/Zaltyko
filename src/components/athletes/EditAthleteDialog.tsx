"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { athleteStatusOptions } from "@/lib/athletes/constants";

import { Modal } from "@/components/ui/modal";

interface AthleteSummary {
  id: string;
  name: string;
  level: string | null;
  status: (typeof athleteStatusOptions)[number];
  dob: string | null;
  groupId: string | null;
  groupName?: string | null;
}

interface GuardianSummary {
  linkId: string;
  guardianId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkRelationship: string | null;
  notifyEmail: boolean | null;
  notifySms: boolean | null;
  isPrimary: boolean | null;
}

interface EditAthleteDialogProps {
  athlete: AthleteSummary;
  academyId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  levelSuggestions?: string[];
  groups?: {
    id: string;
    name: string;
    color: string | null;
  }[];
}

const formatDob = (value: string | null) => {
  if (!value) return "";
  if (value.length >= 10) {
    return value.slice(0, 10);
  }
  return "";
};

export function EditAthleteDialog({
  athlete,
  academyId,
  open,
  onClose,
  onUpdated,
  onDeleted,
  levelSuggestions = [],
  groups = [],
}: EditAthleteDialogProps) {
  const [name, setName] = useState(athlete.name);
  const [dob, setDob] = useState(formatDob(athlete.dob));
  const [level, setLevel] = useState(athlete.level ?? "");
  const [status, setStatus] = useState<(typeof athleteStatusOptions)[number]>(athlete.status);
  const [groupId, setGroupId] = useState<string>(athlete.groupId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [guardianForm, setGuardianForm] = useState({
    name: "",
    email: "",
    phone: "",
    relationship: "",
    notifyEmail: true,
    notifySms: false,
  });
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<GuardianSummary[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(athlete.name);
    setDob(formatDob(athlete.dob));
    setLevel(athlete.level ?? "");
    setStatus(athlete.status);
    setGroupId(athlete.groupId ?? "");
    setError(null);
    setGuardianError(null);
    setGuardianForm({
      name: "",
      email: "",
      phone: "",
      relationship: "",
      notifyEmail: true,
      notifySms: false,
    });
  }, [open, athlete]);

  useEffect(() => {
    if (!open) return;

    const abortController = new AbortController();
    const fetchGuardians = async () => {
      try {
        setGuardiansLoading(true);
        const response = await fetch(`/api/athletes/${athlete.id}/guardians`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error("No se pudieron cargar los contactos.");
        }
        const data = await response.json();
        setGuardians(data.items ?? []);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setGuardianError((err as Error)?.message ?? "Error al cargar contactos.");
        }
      } finally {
        setGuardiansLoading(false);
      }
    };

    fetchGuardians();
    return () => abortController.abort();
  }, [open, athlete.id]);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {};
        if (name.trim() !== athlete.name) payload.name = name.trim();
        if (dob !== formatDob(athlete.dob)) payload.dob = dob || null;
        if (level.trim() !== (athlete.level ?? "")) payload.level = level.trim() || null;
        if (status !== athlete.status) payload.status = status;
        if ((groupId || null) !== (athlete.groupId ?? null)) payload.groupId = groupId || null;

        if (Object.keys(payload).length === 0) {
          onClose();
          return;
        }

        const response = await fetch(`/api/athletes/${athlete.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo guardar los cambios.");
        }

        onUpdated();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error al guardar cambios.");
      }
    });
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Seguro que deseas eliminar este atleta?")) {
      return;
    }
    try {
      const response = await fetch(`/api/athletes/${athlete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar el atleta.");
      }
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Error al eliminar el atleta.");
    }
  };

  const handleAddGuardian = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGuardianError(null);

    if (!guardianForm.name.trim()) {
      setGuardianError("El nombre es obligatorio.");
      return;
    }

    try {
      const payload = {
        name: guardianForm.name.trim(),
        email: guardianForm.email.trim() || undefined,
        phone: guardianForm.phone.trim() || undefined,
        relationship: guardianForm.relationship.trim() || undefined,
        notifyEmail: guardianForm.notifyEmail,
        notifySms: guardianForm.notifySms,
      };

      const response = await fetch(`/api/athletes/${athlete.id}/guardians`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo añadir el contacto.");
      }

      const data = await response.json();
      if (data.item) {
        setGuardians((prev) => [...prev, data.item]);
      }
      setGuardianForm({
        name: "",
        email: "",
        phone: "",
        relationship: "",
        notifyEmail: true,
        notifySms: false,
      });
    } catch (err: any) {
      setGuardianError(err.message ?? "Error desconocido al crear el contacto.");
    }
  };

  const handleRemoveGuardian = async (linkId: string) => {
    if (!window.confirm("¿Eliminar este contacto familiar?")) {
      return;
    }

    try {
      const response = await fetch(`/api/athletes/${athlete.id}/guardians/${linkId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar el contacto.");
      }
      setGuardians((prev) => prev.filter((item) => item.linkId !== linkId));
    } catch (err: any) {
      setGuardianError(err.message ?? "Error al eliminar el contacto.");
    }
  };

  const guardianCount = guardians.length;

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const hasChanges = useMemo(() => {
    return (
      name.trim() !== athlete.name ||
      dob !== formatDob(athlete.dob) ||
      level.trim() !== (athlete.level ?? "") ||
      status !== athlete.status ||
      (groupId || null) !== (athlete.groupId ?? null)
    );
  }, [name, dob, level, status, groupId, athlete]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar atleta"
      description="Actualiza la información del atleta y gestiona sus contactos familiares."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm font-semibold text-red-600 hover:underline"
          >
            Eliminar atleta
          </button>
          <div className="flex gap-2">
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
              form="edit-athlete-form"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending || !hasChanges}
            >
              {isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      }
    >
      <form id="edit-athlete-form" onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Nombre completo</label>
          <input
            value={name}
          onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Fecha de nacimiento</label>
            <input
              type="date"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nivel</label>
            <input
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              list="edit-athlete-levels"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {levelSuggestions.length > 0 && (
              <datalist id="edit-athlete-levels">
                {levelSuggestions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Estado</label>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as (typeof athleteStatusOptions)[number])
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {athleteStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <label className="text-sm font-medium text-foreground">Grupo principal</label>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Sin grupo</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Actualiza el grupo para sincronizar asistencia y evaluaciones del atleta.
            </p>
          </div>
        </div>
      </form>

      <section className="mt-8 space-y-4">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Contactos familiares ({guardianCount})
            </h3>
            <p className="text-xs text-muted-foreground">
              Añade tutores y responsables para comunicaciones y autorizaciones.
            </p>
          </div>
        </header>

        {guardianError && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {guardianError}
          </div>
        )}

        <div className="space-y-3">
          {guardiansLoading && <p className="text-sm text-muted-foreground">Cargando contactos…</p>}
          {!guardiansLoading && guardians.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aún no hay contactos agregados para este atleta.
            </p>
          )}
          {guardians.map((guardian) => (
            <div
              key={guardian.linkId}
              className="rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{guardian.name ?? "Sin nombre"}</p>
                  <p className="text-xs text-muted-foreground">
                    {guardian.email ?? "Sin correo"} · {guardian.phone ?? "Sin teléfono"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Relación: {guardian.linkRelationship ?? guardian.email ?? "No especificada"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveGuardian(guardian.linkId)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddGuardian} className="rounded-md border border-dashed border-border/80 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Añadir nuevo contacto</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={guardianForm.name}
              onChange={(event) =>
                setGuardianForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Nombre"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
            <input
              type="email"
              value={guardianForm.email}
              onChange={(event) =>
                setGuardianForm((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="Correo"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={guardianForm.phone}
              onChange={(event) =>
                setGuardianForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              placeholder="Teléfono"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={guardianForm.relationship}
              onChange={(event) =>
                setGuardianForm((prev) => ({ ...prev, relationship: event.target.value }))
              }
              placeholder="Relación"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={guardianForm.notifyEmail}
                onChange={(event) =>
                  setGuardianForm((prev) => ({ ...prev, notifyEmail: event.target.checked }))
                }
              />
              Recibir correos
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={guardianForm.notifySms}
                onChange={(event) =>
                  setGuardianForm((prev) => ({ ...prev, notifySms: event.target.checked }))
                }
              />
              Recibir SMS
            </label>
          </div>
          <button
            type="submit"
            className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80"
          >
            Añadir contacto
          </button>
        </form>
      </section>
    </Modal>
  );
}



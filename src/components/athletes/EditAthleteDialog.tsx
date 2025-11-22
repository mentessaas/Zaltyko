"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { useToast } from "@/components/ui/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { Modal } from "@/components/ui/modal";
import { Calendar as CalendarIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  profileId: string | null;
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

const composeLevelLabel = (
  category: (typeof CATEGORY_OPTIONS)[number] | "",
  level: (typeof LEVEL_OPTIONS)[number] | ""
): string | null => {
  if (!category && !level) return null;
  const parts: string[] = [];
  if (category) parts.push(`Categoría ${category}`);
  if (level) {
    if (level === "Pre-nivel") parts.push("Pre-nivel");
    else if (level === "FIG") parts.push("FIG");
    else parts.push(`Nivel ${level}`);
  }
  return parts.join(" · ") || null;
};

const CATEGORY_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
const LEVEL_OPTIONS = [
  "Pre-nivel",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "FIG",
] as const;

const RELATIONSHIP_OPTIONS = [
  "Madre",
  "Padre",
  "Tutor",
  "Tutora",
  "Abuelo",
  "Abuela",
  "Hermano",
  "Hermana",
  "Tío",
  "Tía",
] as const;

function parseLevel(rawLevel: string | null): {
  category: (typeof CATEGORY_OPTIONS)[number] | "";
  level: (typeof LEVEL_OPTIONS)[number] | "";
} {
  if (!rawLevel) {
    return { category: "", level: "" };
  }

  const categoryMatch = rawLevel.match(/Categoría\s([A-F])/i);
  const levelMatch = rawLevel.match(/Nivel\s(\d+)|FIG|Pre-nivel/i);

  let parsedCategory: (typeof CATEGORY_OPTIONS)[number] | "" = "";
  let parsedLevel: (typeof LEVEL_OPTIONS)[number] | "" = "";

  if (categoryMatch && CATEGORY_OPTIONS.includes(categoryMatch[1].toUpperCase() as any)) {
    parsedCategory = categoryMatch[1].toUpperCase() as (typeof CATEGORY_OPTIONS)[number];
  }

  if (levelMatch) {
    const value = levelMatch[0];
    if (/FIG/i.test(value)) {
      parsedLevel = "FIG";
    } else if (/Pre-nivel/i.test(value)) {
      parsedLevel = "Pre-nivel";
    } else if (value.match(/Nivel\s(\d+)/i)) {
      const num = value.match(/Nivel\s(\d+)/i)?.[1];
      if (num && LEVEL_OPTIONS.includes(num as any)) {
        parsedLevel = num as (typeof LEVEL_OPTIONS)[number];
      }
    }
  }

  return { category: parsedCategory, level: parsedLevel };
}

export function EditAthleteDialog({
  athlete,
  academyId,
  open,
  onClose,
  onUpdated,
  onDeleted,
  groups = [],
}: EditAthleteDialogProps) {
  const toast = useToast();
  const [name, setName] = useState(athlete.name);
  const [dob, setDob] = useState(formatDob(athlete.dob));
  const initialLevel = useMemo(() => parseLevel(athlete.level ?? null), [athlete.level]);
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number] | "">(initialLevel.category);
  const [level, setLevel] = useState<(typeof LEVEL_OPTIONS)[number] | "">(initialLevel.level);
  const [status, setStatus] = useState<(typeof athleteStatusOptions)[number]>(athlete.status);
  const [groupId, setGroupId] = useState<string>(athlete.groupId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [guardianForm, setGuardianForm] = useState<{
    name: string;
    email: string;
    phone: string;
    relationship: string;
    notifyEmail: boolean;
    notifySms: boolean;
  }>({
    name: "",
    email: "",
    phone: "",
    relationship: RELATIONSHIP_OPTIONS[0],
    notifyEmail: true,
    notifySms: false,
  });
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<GuardianSummary[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [editingGuardianForm, setEditingGuardianForm] = useState({
    name: "",
    email: "",
    phone: "",
    relationship: "",
    notifyEmail: true,
    notifySms: false,
    isPrimary: false,
  });
  const [isSavingGuardian, setIsSavingGuardian] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(athlete.name);
    setDob(formatDob(athlete.dob));
    const parsed = parseLevel(athlete.level ?? null);
    setCategory(parsed.category);
    setLevel(parsed.level);
    setStatus(athlete.status);
    setGroupId(athlete.groupId ?? "");
    setError(null);
    setGuardianError(null);
    setGuardianForm({
      name: "",
      email: "",
      phone: "",
      relationship: RELATIONSHIP_OPTIONS[0],
      notifyEmail: true,
      notifySms: false,
    });
    // NO resetear guardians aquí, se cargarán en el useEffect siguiente
  }, [open, athlete]);

  useEffect(() => {
    if (!open) {
      // Resetear guardians cuando se cierra el modal
      setGuardians([]);
      setGuardiansLoading(false);
      setGuardianError(null);
      return;
    }

    const abortController = new AbortController();
    const fetchGuardians = async () => {
      try {
        setGuardiansLoading(true);
        setGuardianError(null);
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        const headers: Record<string, string> = { "x-academy-id": academyId };
        if (currentUser?.id) {
          headers["x-user-id"] = currentUser.id;
        }
        const response = await fetch(`/api/athletes/${athlete.id}/guardians`, {
          signal: abortController.signal,
          headers,
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message ?? `Error ${response.status}: No se pudieron cargar los contactos.`);
        }
        
        const data = await response.json();
        const items = data.items ?? [];
        
        console.log(`[EditAthleteDialog] Respuesta completa de la API:`, data);
        console.log(`[EditAthleteDialog] Cargados ${items.length} contactos para atleta ${athlete.id}`, items);
        
        if (items.length === 0 && !data.error) {
          console.warn(`[EditAthleteDialog] No se encontraron contactos pero la respuesta fue exitosa. Verificar datos en BD.`);
        }
        
        setGuardians(items);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          const errorMessage = (err as Error)?.message ?? "Error al cargar contactos.";
          console.error(`[EditAthleteDialog] Error al cargar contactos:`, err);
          setGuardianError(errorMessage);
        }
      } finally {
        setGuardiansLoading(false);
      }
    };

    fetchGuardians();
    return () => abortController.abort();
  }, [open, athlete.id, academyId]);

  const composedLevel = useMemo(() => composeLevelLabel(category, level), [category, level]);

  const computedAgeYears = useMemo(() => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return null;
    const now = new Date();
    let ageYears = now.getFullYear() - birthDate.getFullYear();
    const hasBirthday =
      now.getMonth() > birthDate.getMonth() ||
      (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
    if (!hasBirthday) ageYears -= 1;
    return ageYears >= 0 ? ageYears : null;
  }, [dob]);

  const computedAgeLabel = useMemo(() => {
    return computedAgeYears != null ? `${computedAgeYears} años` : "";
  }, [computedAgeYears]);

  const birthdateInputRef = useRef<HTMLInputElement>(null);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Optimistic update: actualizar estado local inmediatamente
    const optimisticUpdate = {
      ...athlete,
      name: name.trim(),
      dob: dob || null,
      level: composedLevel,
      status,
      groupId: groupId || null,
    };

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {};
        if (name.trim() !== athlete.name) payload.name = name.trim();
        if (dob !== formatDob(athlete.dob)) payload.dob = dob || null;
        const nextLevel = composedLevel;
        if (nextLevel !== (athlete.level ?? null)) payload.level = nextLevel;
        if (status !== athlete.status) payload.status = status;
        if ((groupId || null) !== (athlete.groupId ?? null)) payload.groupId = groupId || null;
        if (dob !== formatDob(athlete.dob) && computedAgeYears != null) {
          payload.age = computedAgeYears;
        }

        if (Object.keys(payload).length === 0) {
          toast.pushToast({
            title: "Sin cambios",
            description: "Realiza una modificación antes de guardar.",
            variant: "info",
          });
          onClose();
          return;
        }

        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        const headers: Record<string, string> = { "Content-Type": "application/json", "x-academy-id": academyId };
        if (currentUser?.id) headers["x-user-id"] = currentUser.id;

        const response = await fetch(`/api/athletes/${athlete.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          // Revertir optimistic update en caso de error
          setName(athlete.name);
          setDob(formatDob(athlete.dob));
          setCategory(initialLevel.category);
          setLevel(initialLevel.level);
          setStatus(athlete.status);
          setGroupId(athlete.groupId ?? "");
          
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo guardar los cambios.");
        }

        toast.pushToast({
          title: "Atleta actualizado",
          description: "Los cambios se han guardado correctamente.",
          variant: "success",
        });

        onUpdated();
        onClose();
      } catch (err: any) {
        const errorMessage = err.message ?? "Error al guardar cambios.";
        setError(errorMessage);
        toast.pushToast({
          title: "Error al actualizar",
          description: errorMessage,
          variant: "error",
        });
      }
    });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const headers: Record<string, string> = { "x-academy-id": academyId };
      if (currentUser?.id) headers["x-user-id"] = currentUser.id;

      const response = await fetch(`/api/athletes/${athlete.id}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar el atleta.");
      }
      
      toast.pushToast({
        title: "Atleta eliminado",
        description: "El atleta ha sido eliminado correctamente.",
        variant: "success",
      });
      
      onDeleted();
      setDeleteDialogOpen(false);
      onClose();
    } catch (err: any) {
      const errorMessage = err.message ?? "Error al eliminar el atleta.";
      setError(errorMessage);
      toast.pushToast({
        title: "Error al eliminar",
        description: errorMessage,
        variant: "error",
      });
    } finally {
      setIsDeleting(false);
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

      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const headers: Record<string, string> = { "Content-Type": "application/json", "x-academy-id": academyId };
      if (currentUser?.id) headers["x-user-id"] = currentUser.id;

      const response = await fetch(`/api/athletes/${athlete.id}/guardians`, {
        method: "POST",
        headers,
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
        relationship: RELATIONSHIP_OPTIONS[0],
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
      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const headers: Record<string, string> = { "x-academy-id": academyId };
      if (currentUser?.id) {
        headers["x-user-id"] = currentUser.id;
      }
      const response = await fetch(`/api/athletes/${athlete.id}/guardians/${linkId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar el contacto.");
      }
      setGuardians((prev) => prev.filter((item) => item.linkId !== linkId));
      if (editingGuardianId === linkId) {
        cancelEditGuardian();
      }
    } catch (err: any) {
      setGuardianError(err.message ?? "Error al eliminar el contacto.");
    }
  };

  const guardianCount = guardians.length;

  const beginEditGuardian = (guardian: GuardianSummary) => {
    setGuardianError(null);
    setEditingGuardianId(guardian.linkId);
    setEditingGuardianForm({
      name: guardian.name ?? "",
      email: guardian.email ?? "",
      phone: guardian.phone ?? "",
    relationship: guardian.linkRelationship ?? "",
      notifyEmail: guardian.notifyEmail ?? true,
      notifySms: guardian.notifySms ?? false,
      isPrimary: guardian.isPrimary ?? false,
    });
  };

  const cancelEditGuardian = () => {
    setEditingGuardianId(null);
    setIsSavingGuardian(false);
  };

  const handleUpdateGuardian = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingGuardianId) return;

    if (!editingGuardianForm.name.trim()) {
      setGuardianError("El nombre del contacto es obligatorio.");
      return;
    }

    try {
      setIsSavingGuardian(true);
      const payload = {
        name: editingGuardianForm.name.trim(),
        email: editingGuardianForm.email.trim() || undefined,
        phone: editingGuardianForm.phone.trim() || undefined,
        relationship: editingGuardianForm.relationship.trim() || undefined,
        linkRelationship: editingGuardianForm.relationship.trim() || undefined,
        notifyEmail: editingGuardianForm.notifyEmail,
        notifySms: editingGuardianForm.notifySms,
        isPrimary: editingGuardianForm.isPrimary,
      };

      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-academy-id": academyId,
      };
      if (currentUser?.id) headers["x-user-id"] = currentUser.id;

      const response = await fetch(`/api/athletes/${athlete.id}/guardians/${editingGuardianId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo actualizar el contacto.");
      }

      const data = await response.json();
      if (data.item) {
        setGuardians((prev) => prev.map((item) => (item.linkId === editingGuardianId ? data.item : item)));
      }

      cancelEditGuardian();
    } catch (err: any) {
      setGuardianError(err.message ?? "Error al actualizar el contacto.");
    } finally {
      setIsSavingGuardian(false);
    }
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const hasChanges = useMemo(() => {
    return (
      name.trim() !== athlete.name ||
      dob !== formatDob(athlete.dob) ||
      composedLevel !== (athlete.level ?? null) ||
      status !== athlete.status ||
      (groupId || null) !== (athlete.groupId ?? null)
    );
  }, [name, dob, composedLevel, status, groupId, athlete]);

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
            onClick={() => setDeleteDialogOpen(true)}
            className="text-sm font-semibold text-red-600 hover:underline"
            disabled={isPending || isDeleting}
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
      <form id="edit-athlete-form" onSubmit={handleSave} className="space-y-8">
        {error && (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
          <header className="mb-4 flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Información general
            </p>
            <h3 className="text-lg font-semibold text-foreground">Datos del atleta</h3>
            <p className="text-sm text-muted-foreground">
              Mantén actualizados los datos básicos para reportes y comunicación.
            </p>
          </header>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nombre completo</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Ej. Sofía Hernández"
                required
              />
            </div>
            <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground md:grid-cols-3">
              <div>
                <p className="uppercase tracking-wide">Edad estimada</p>
                <p className="text-base font-semibold text-foreground">{computedAgeLabel || "—"}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide">Estado</p>
                <p className="text-base font-semibold text-foreground">{status}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide">Grupo</p>
                <p className="text-base font-semibold text-foreground">
                  {groups.find((group) => group.id === groupId)?.name ?? "Sin asignar"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha de nacimiento</label>
              <div className="flex items-center gap-2">
                <input
                  ref={birthdateInputRef}
                  type="date"
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => birthdateInputRef.current?.showPicker?.()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
                  aria-label="Seleccionar fecha"
                >
                  <CalendarIcon className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>
            <div className="space-y-2">
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
                Define el grupo para sincronizar asistencia, evaluaciones y reportes.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
          <header className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nivel competitivo
            </p>
            <h3 className="text-base font-semibold text-foreground">Categoría, nivel y estado</h3>
          </header>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Categoría</label>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as (typeof CATEGORY_OPTIONS)[number] | "")
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Sin categoría</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nivel</label>
              <select
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value as (typeof LEVEL_OPTIONS)[number] | "")
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecciona nivel</option>
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === "Pre-nivel" ? "Pre-nivel" : option === "FIG" ? "FIG" : `Nivel ${option}`}
                  </option>
                ))}
              </select>
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
          </div>
        </section>
      </form>

      <section className="mt-8 space-y-4 rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
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
          {guardiansLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>Cargando contactos…</span>
            </div>
          )}
          {!guardiansLoading && guardianError && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
              Error al cargar: {guardianError}
            </div>
          )}
          {!guardiansLoading && guardians.length === 0 && !guardianError && (
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Aún no hay contactos agregados para este atleta.
            </div>
          )}
          {!guardiansLoading && guardians.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {guardians.length} contacto{guardians.length !== 1 ? "s" : ""} encontrado{guardians.length !== 1 ? "s" : ""}
              </p>
              {guardians.map((guardian) => (
                <div
                  key={guardian.linkId}
                  className="rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-sm"
                >
              {editingGuardianId === guardian.linkId ? (
                <form onSubmit={handleUpdateGuardian} className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={editingGuardianForm.name}
                      onChange={(event) =>
                        setEditingGuardianForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Nombre"
                      required
                    />
                    <input
                      type="email"
                      value={editingGuardianForm.email}
                      onChange={(event) =>
                        setEditingGuardianForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Correo"
                    />
                    <input
                      value={editingGuardianForm.phone}
                      onChange={(event) =>
                        setEditingGuardianForm((prev) => ({ ...prev, phone: event.target.value }))
                      }
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Teléfono"
                    />
                    <input
                      value={editingGuardianForm.relationship}
                      onChange={(event) =>
                        setEditingGuardianForm((prev) => ({ ...prev, relationship: event.target.value }))
                      }
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Relación"
                    />
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingGuardianForm.notifyEmail}
                        onChange={(event) =>
                          setEditingGuardianForm((prev) => ({ ...prev, notifyEmail: event.target.checked }))
                        }
                      />
                      Recibir correos
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingGuardianForm.notifySms}
                        onChange={(event) =>
                          setEditingGuardianForm((prev) => ({ ...prev, notifySms: event.target.checked }))
                        }
                      />
                      Recibir SMS
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingGuardianForm.isPrimary}
                        onChange={(event) =>
                          setEditingGuardianForm((prev) => ({ ...prev, isPrimary: event.target.checked }))
                        }
                      />
                      Contacto principal
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditGuardian}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                      disabled={isSavingGuardian}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSavingGuardian}
                    >
                      {isSavingGuardian ? "Guardando…" : "Guardar contacto"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuardian(guardian.linkId)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                      disabled={isSavingGuardian}
                    >
                      Eliminar
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-semibold">{guardian.name ?? "Sin nombre"}</p>
                      <p className="text-xs text-muted-foreground">
                        {guardian.email ?? "Sin correo"} · {guardian.phone ?? "Sin teléfono"}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-white/60 px-2 py-0.5 font-semibold text-foreground">
                          Relación: {guardian.linkRelationship ?? guardian.email ?? "No especificada"}
                        </span>
                        {guardian.isPrimary ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                            Principal
                          </span>
                        ) : null}
                        {guardian.notifyEmail
                          ? <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">Email</span>
                          : null}
                        {guardian.notifySms
                          ? <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-700">SMS</span>
                          : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      {guardian.profileId ? (
                        <Link
                          href={`/dashboard/profile/${guardian.profileId}`}
                          className="text-primary hover:underline"
                        >
                          Ver familiar
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Sin perfil</span>
                      )}
                      <button
                        type="button"
                        onClick={() => beginEditGuardian(guardian)}
                        className="text-primary hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveGuardian(guardian.linkId)}
                        className="text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </>
              )}
                </div>
              ))}
            </div>
          )}
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
              required
            />
            <input
              value={guardianForm.phone}
              onChange={(event) =>
                setGuardianForm((prev) => ({
                  ...prev,
                  phone: event.target.value,
                }))
              }
              placeholder="Teléfono"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
            <div className="grid gap-2">
              <select
                value={RELATIONSHIP_OPTIONS.includes(guardianForm.relationship as any) ? guardianForm.relationship : "Otro"}
                onChange={(event) => {
                  const value = event.target.value;
                  setGuardianForm((prev) => ({
                    ...prev,
                    relationship: value === "Otro" ? "" : value,
                  }));
                }}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="Otro">Otro (especificar)</option>
              </select>
              {(!RELATIONSHIP_OPTIONS.includes(guardianForm.relationship as any) || guardianForm.relationship === "") && (
                <input
                  value={guardianForm.relationship}
                  onChange={(event) =>
                    setGuardianForm((prev) => ({
                      ...prev,
                      relationship: event.target.value,
                    }))
                  }
                  placeholder="Especifica la relación"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              )}
            </div>
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

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Eliminar atleta"
        description={`¿Estás seguro de eliminar a "${athlete.name}"? Esta acción no se puede deshacer y eliminará todos los datos asociados al atleta.`}
        variant="destructive"
        confirmText="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
        loading={isDeleting}
      />
    </Modal>
  );
}



"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import type { AthleteSummary, GuardianSummary, GuardianFormData, ParsedLevel } from "@/types/athlete-edit";
import { formatDob, parseLevel, composeLevelLabel, calculateAge } from "@/lib/athletes/level-utils";
import { RELATIONSHIP_OPTIONS } from "@/types/athlete-edit";

interface UseEditAthleteProps {
  athlete: AthleteSummary;
  academyId: string;
  open: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function useEditAthlete({
  athlete,
  academyId,
  open,
  onUpdated,
  onDeleted,
}: UseEditAthleteProps) {
  const toast = useToast();
  const [name, setName] = useState(athlete.name);
  const [dob, setDob] = useState(formatDob(athlete.dob));
  const initialLevel = useMemo(() => parseLevel(athlete.level ?? null), [athlete.level]);
  const [category, setCategory] = useState(initialLevel.category);
  const [level, setLevel] = useState(initialLevel.level);
  const [status, setStatus] = useState(athlete.status);
  const [groupId, setGroupId] = useState(athlete.groupId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [guardianForm, setGuardianForm] = useState<GuardianFormData>({
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
  const [editingGuardianForm, setEditingGuardianForm] = useState<GuardianFormData & { isPrimary: boolean }>({
    name: "",
    email: "",
    phone: "",
    relationship: "",
    notifyEmail: true,
    notifySms: false,
    isPrimary: false,
  });
  const [isSavingGuardian, setIsSavingGuardian] = useState(false);

  // Reset form when athlete or open changes
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
  }, [open, athlete]);

  // Fetch guardians when dialog opens
  useEffect(() => {
    if (!open) {
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
        setGuardians(items);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          const errorMessage = (err as Error)?.message ?? "Error al cargar contactos.";
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
  const computedAgeYears = useMemo(() => calculateAge(dob), [dob]);
  const computedAgeLabel = useMemo(() => {
    return computedAgeYears != null ? `${computedAgeYears} años` : "";
  }, [computedAgeYears]);

  const hasChanges = useMemo(() => {
    return (
      name.trim() !== athlete.name ||
      dob !== formatDob(athlete.dob) ||
      composedLevel !== (athlete.level ?? null) ||
      status !== athlete.status ||
      (groupId || null) !== (athlete.groupId ?? null)
    );
  }, [name, dob, composedLevel, status, groupId, athlete]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

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
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo guardar los cambios.");
        }

        toast.pushToast({
          title: "Atleta actualizado",
          description: "Los cambios se han guardado correctamente.",
          variant: "success",
        });

        onUpdated();
      } catch (err) {
        const errorMessage = (err as Error)?.message ?? "Error al guardar cambios.";
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
    } catch (err) {
      const errorMessage = (err as Error)?.message ?? "Error al eliminar el atleta.";
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

  const handleAddGuardian = async (event: React.FormEvent<HTMLFormElement>) => {
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
    } catch (err) {
      setGuardianError((err as Error)?.message ?? "Error desconocido al crear el contacto.");
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
    } catch (err) {
      setGuardianError((err as Error)?.message ?? "Error al eliminar el contacto.");
    }
  };

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

  const handleUpdateGuardian = async (event: React.FormEvent<HTMLFormElement>) => {
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
    } catch (err) {
      setGuardianError((err as Error)?.message ?? "Error al actualizar el contacto.");
    } finally {
      setIsSavingGuardian(false);
    }
  };

  return {
    // Form state
    name,
    setName,
    dob,
    setDob,
    category,
    setCategory,
    level,
    setLevel,
    status,
    setStatus,
    groupId,
    setGroupId,
    error,
    isPending,
    deleteDialogOpen,
    setDeleteDialogOpen,
    isDeleting,
    hasChanges,
    computedAgeLabel,
    composedLevel,
    // Guardian state
    guardianForm,
    setGuardianForm,
    guardianError,
    guardians,
    guardiansLoading,
    editingGuardianId,
    editingGuardianForm,
    setEditingGuardianForm,
    isSavingGuardian,
    // Handlers
    handleSave,
    handleDelete,
    handleAddGuardian,
    handleRemoveGuardian,
    beginEditGuardian,
    cancelEditGuardian,
    handleUpdateGuardian,
  };
}


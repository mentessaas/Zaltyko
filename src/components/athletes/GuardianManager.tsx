"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Guardian = {
  linkId: string;
  guardianId: string;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
};

interface GuardianManagerProps {
  athleteId: string;
  academyId: string;
  initialGuardians: Guardian[];
}

const defaultFormState = {
  name: "",
  email: "",
  phone: "",
  relationship: "",
  isPrimary: false,
};

export default function GuardianManager({
  athleteId,
  academyId,
  initialGuardians,
}: GuardianManagerProps) {
  const [guardians, setGuardians] = useState<Guardian[]>(initialGuardians);
  const [form, setForm] = useState(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name) {
      setMessage("Introduce el nombre del tutor.");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch(`/api/athletes/${athleteId}/guardians`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
          ...(user?.id ? { "x-user-id": user.id } : {}),
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          relationship: form.relationship || undefined,
          isPrimary: form.isPrimary,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo crear el tutor.");
      }

      const { item } = await response.json();
      setGuardians((prev) => [
        ...prev,
        {
          linkId: item.linkId,
          guardianId: item.guardianId,
          name: item.name,
          email: item.email ?? "",
          phone: item.phone ?? "",
          relationship: item.linkRelationship ?? item.relationship ?? "",
          isPrimary: item.isPrimary,
          notifyEmail: item.notifyEmail,
          notifySms: item.notifySms,
        },
      ]);
      setForm(defaultFormState);
      setMessage("Tutor añadido correctamente.");
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (guardian: Guardian, updates: Partial<Guardian>) => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch(
        `/api/athletes/${athleteId}/guardians/${guardian.linkId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
            ...(user?.id ? { "x-user-id": user.id } : {}),
          },
          body: JSON.stringify({
            name: updates.name ?? guardian.name,
            email: updates.email ?? guardian.email,
            phone: updates.phone ?? guardian.phone,
            linkRelationship: updates.relationship ?? guardian.relationship,
            isPrimary: updates.isPrimary ?? guardian.isPrimary,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo actualizar el tutor.");
      }

      const { item } = await response.json();
      setGuardians((prev) =>
        prev.map((entry) =>
          entry.linkId === guardian.linkId
            ? {
                linkId: item.linkId,
                guardianId: item.guardianId,
                name: item.name,
                email: item.email ?? "",
                phone: item.phone ?? "",
                relationship: item.linkRelationship ?? item.relationship ?? "",
                isPrimary: item.isPrimary,
                notifyEmail: item.notifyEmail,
                notifySms: item.notifySms,
              }
            : entry
        )
      );
      setMessage("Tutor actualizado.");
      setEditingId(null);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (guardian: Guardian) => {
    if (!confirm(`¿Eliminar a ${guardian.name}?`)) {
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch(
        `/api/athletes/${athleteId}/guardians/${guardian.linkId}`,
        {
          method: "DELETE",
          headers: {
            "x-academy-id": academyId,
            ...(user?.id ? { "x-user-id": user.id } : {}),
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo eliminar el tutor.");
      }

      setGuardians((prev) => prev.filter((item) => item.linkId !== guardian.linkId));
      setMessage("Tutor eliminado.");
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-lg border bg-card p-6 shadow">
        <h2 className="text-lg font-semibold">Listado de tutores</h2>
        {guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay tutores vinculados. Usa el formulario para añadirlos.
          </p>
        ) : (
          <ul className="space-y-4">
            {guardians.map((guardian) => (
              <li key={guardian.linkId} className="rounded-md border border-border p-4">
                {editingId === guardian.linkId ? (
                  <EditGuardianForm
                    guardian={guardian}
                    onCancel={() => setEditingId(null)}
                    onSave={(updates) => handleUpdate(guardian, updates)}
                    disabled={isSubmitting}
                  />
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold">{guardian.name}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {guardian.relationship || "Sin relación definida"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(guardian.linkId)}
                          disabled={isSubmitting}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(guardian)}
                          disabled={isSubmitting}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>Email: {guardian.email || "—"}</span>
                      <span>Teléfono: {guardian.phone || "—"}</span>
                      <span>Principal: {guardian.isPrimary ? "Sí" : "No"}</span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-6 shadow">
        <h2 className="text-lg font-semibold">Añadir tutor</h2>
        <form onSubmit={handleCreate} className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="relationship">Relación</Label>
            <Input
              id="relationship"
              name="relationship"
              value={form.relationship}
              onChange={handleChange}
              placeholder="Madre, Padre, Tutor..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Correo (opcional)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input
              id="phone"
              name="phone"
              value={form.phone}
              onChange={handleChange}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPrimary"
              checked={form.isPrimary}
              onChange={handleChange}
            />
            Marcar como contacto principal
          </label>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar tutor"}
          </Button>
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </form>
      </div>
    </div>
  );
}

interface EditGuardianFormProps {
  guardian: Guardian;
  disabled: boolean;
  onCancel: () => void;
  onSave: (updates: Partial<Guardian>) => void;
}

function EditGuardianForm({ guardian, disabled, onCancel, onSave }: EditGuardianFormProps) {
  const [formState, setFormState] = useState({
    name: guardian.name,
    email: guardian.email,
    phone: guardian.phone,
    relationship: guardian.relationship,
    isPrimary: guardian.isPrimary,
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(formState);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div className="space-y-1">
        <Label htmlFor={`edit-name-${guardian.linkId}`}>Nombre</Label>
        <Input
          id={`edit-name-${guardian.linkId}`}
          name="name"
          value={formState.name}
          onChange={handleChange}
          required
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`edit-relationship-${guardian.linkId}`}>Relación</Label>
        <Input
          id={`edit-relationship-${guardian.linkId}`}
          name="relationship"
          value={formState.relationship}
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`edit-email-${guardian.linkId}`}>Correo</Label>
        <Input
          id={`edit-email-${guardian.linkId}`}
          name="email"
          type="email"
          value={formState.email}
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`edit-phone-${guardian.linkId}`}>Teléfono</Label>
        <Input
          id={`edit-phone-${guardian.linkId}`}
          name="phone"
          value={formState.phone}
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPrimary"
          checked={formState.isPrimary}
          onChange={handleChange}
          disabled={disabled}
        />
        Contacto principal
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={disabled}>
          Guardar cambios
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}



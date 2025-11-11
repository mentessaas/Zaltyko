"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { createClient } from "@/lib/supabase/client";

import { Modal } from "@/components/ui/modal";

interface ContactInput {
  name: string;
  email: string;
  relationship: string;
  phone: string;
  notifyEmail: boolean;
  notifySms: boolean;
}

interface CreateAthleteDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  levelSuggestions?: string[];
  groups?: {
    id: string;
    name: string;
    color: string | null;
  }[];
}

const createEmptyContact = (): ContactInput => ({
  name: "",
  email: "",
  relationship: "",
  phone: "",
  notifyEmail: true,
  notifySms: false,
});

export function CreateAthleteDialog({
  academyId,
  open,
  onClose,
  onCreated,
  levelSuggestions = [],
  groups = [],
}: CreateAthleteDialogProps) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState<(typeof athleteStatusOptions)[number]>("active");
  const [groupId, setGroupId] = useState("");
  const [contacts, setContacts] = useState<ContactInput[]>([createEmptyContact()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasContacts = useMemo(() => contacts.some((contact) => contact.name.trim().length > 0), [
    contacts,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("El nombre es obligatorio.");
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
          dob: dob ? dob : undefined,
          level: level || undefined,
          status,
          groupId: groupId || undefined,
          contacts: contacts
            .map((contact) => ({
              name: contact.name.trim(),
              relationship: contact.relationship.trim() || undefined,
              email: contact.email.trim() || undefined,
              phone: contact.phone.trim() || undefined,
              notifyEmail: contact.notifyEmail,
              notifySms: contact.notifySms,
            }))
            .filter((contact) => contact.name.length > 0),
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        };

        if (currentUser?.id) {
          headers["x-user-id"] = currentUser.id;
        }

        const response = await fetch("/api/athletes", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo crear el atleta.");
        }

        setName("");
        setDob("");
        setLevel("");
        setStatus("active");
        setGroupId("");
        setContacts([createEmptyContact()]);
        onCreated();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error desconocido al crear el atleta.");
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar nuevo atleta"
      description="Añade un atleta y opcionalmente registra sus contactos familiares."
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
            form="create-athlete-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando..." : "Guardar atleta"}
          </button>
        </div>
      }
    >
      <form id="create-athlete-form" onSubmit={handleSubmit} className="space-y-6">
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
              list="athlete-level-suggestions"
              placeholder="Ej. FIG 5"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {levelSuggestions.length > 0 && (
              <datalist id="athlete-level-suggestions">
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
        </div>
        {groups.length > 0 && (
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
              Usa los grupos para organizar asistencia, evaluaciones y asignaciones de clases.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Contactos familiares {hasContacts ? `(${contacts.length})` : ""}
            </h3>
            <button
              type="button"
              onClick={() => setContacts((prev) => [...prev, createEmptyContact()])}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Añadir contacto
            </button>
          </div>

          {contacts.map((contact, index) => (
            <div key={index} className="rounded-md border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contacto #{index + 1}
                </p>
                {contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setContacts((prev) => prev.filter((_, contactIndex) => contactIndex !== index))
                    }
                    className="text-xs text-red-500 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={contact.name}
                  onChange={(event) =>
                    setContacts((prev) => {
                      const copy = [...prev];
                      copy[index] = { ...copy[index], name: event.target.value };
                      return copy;
                    })
                  }
                  placeholder="Nombre"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="email"
                  value={contact.email}
                  onChange={(event) =>
                    setContacts((prev) => {
                      const copy = [...prev];
                      copy[index] = { ...copy[index], email: event.target.value };
                      return copy;
                    })
                  }
                  placeholder="Correo"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  value={contact.phone}
                  onChange={(event) =>
                    setContacts((prev) => {
                      const copy = [...prev];
                      copy[index] = { ...copy[index], phone: event.target.value };
                      return copy;
                    })
                  }
                  placeholder="Teléfono"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  value={contact.relationship}
                  onChange={(event) =>
                    setContacts((prev) => {
                      const copy = [...prev];
                      copy[index] = { ...copy[index], relationship: event.target.value };
                      return copy;
                    })
                  }
                  placeholder="Relación (madre, tutor, etc.)"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex gap-4 text-xs text-muted-foreground">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={contact.notifyEmail}
                    onChange={(event) =>
                      setContacts((prev) => {
                        const copy = [...prev];
                        copy[index] = { ...copy[index], notifyEmail: event.target.checked };
                        return copy;
                      })
                    }
                  />
                  Recibir correos
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={contact.notifySms}
                    onChange={(event) =>
                      setContacts((prev) => {
                        const copy = [...prev];
                        copy[index] = { ...copy[index], notifySms: event.target.checked };
                        return copy;
                      })
                    }
                  />
                  Recibir SMS
                </label>
              </div>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}



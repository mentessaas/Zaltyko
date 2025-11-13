"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { createClient } from "@/lib/supabase/client";

import { Modal } from "@/components/ui/modal";
import { Calendar as CalendarIcon } from "lucide-react";

interface ContactInput {
  name: string;
  email: string;
  relationship: string;
  phone: string;
  notifyEmail: boolean;
  notifySms: boolean;
}

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
  "Abuelo",
  "Abuela",
  "Hermano",
  "Hermana",
  "Tío",
  "Tía",
] as const;

interface CreateAthleteDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  groups?: {
    id: string;
    name: string;
    color: string | null;
  }[];
}

const createEmptyContact = (): ContactInput => ({
  name: "",
  email: "",
  relationship: "Madre",
  phone: "",
  notifyEmail: true,
  notifySms: false,
});

export function CreateAthleteDialog({
  academyId,
  open,
  onClose,
  onCreated,
  groups = [],
}: CreateAthleteDialogProps) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number] | "">("");
  const [level, setLevel] = useState<(typeof LEVEL_OPTIONS)[number] | "">("");
  const [status, setStatus] = useState<(typeof athleteStatusOptions)[number]>("active");
  const [groupId, setGroupId] = useState("");
  const [contacts, setContacts] = useState<ContactInput[]>([createEmptyContact()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasContacts = useMemo(() => contacts.length > 0, [contacts]);
  const computedAgeYears = useMemo(() => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return null;
    const now = new Date();
    let ageYears = now.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
      now.getMonth() > birthDate.getMonth() ||
      (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
    if (!hasHadBirthdayThisYear) {
      ageYears -= 1;
    }
    return ageYears >= 0 ? ageYears : null;
  }, [dob]);

  const computedAgeLabel = useMemo(() => {
    return computedAgeYears != null ? `${computedAgeYears} años` : "";
  }, [computedAgeYears]);

  const birthdateInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    const hasIncompleteContact = contacts.some(
      (contact) =>
        !contact.name.trim() ||
        !contact.email.trim() ||
        !contact.phone.trim() ||
        !contact.relationship.trim()
    );

    if (hasIncompleteContact) {
      setError("Todos los datos del contacto familiar son obligatorios.");
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
          level:
            category || level
              ? [
                  category ? `Categoría ${category}` : null,
                  level ? (level === "Pre-nivel" ? "Pre-nivel" : `Nivel ${level}`) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined,
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
          ...(computedAgeYears != null ? { age: computedAgeYears } : {}),
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
        setCategory("");
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

        <div className="grid gap-4 md:grid-cols-4">
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
            <label className="text-sm font-medium text-foreground">Edad</label>
            <input
              value={computedAgeLabel}
              readOnly
              placeholder="—"
              className="w-full cursor-not-allowed rounded-md border border-border bg-muted px-3 py-2 text-sm shadow-sm focus:outline-none"
            />
          </div>
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
              onChange={(event) => setLevel(event.target.value as (typeof LEVEL_OPTIONS)[number] | "")}
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
                  required
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
                  required
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
                  required
                />
                <div className="grid gap-2">
                  <select
                    value={RELATIONSHIP_OPTIONS.includes(contact.relationship as any) ? contact.relationship : "Otro"}
                    onChange={(event) => {
                      const value = event.target.value;
                      setContacts((prev) => {
                        const copy = [...prev];
                        copy[index] = {
                          ...copy[index],
                          relationship: value === "Otro" ? "" : value,
                        };
                        return copy;
                      });
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
                  {(!RELATIONSHIP_OPTIONS.includes(contact.relationship as any) || contact.relationship === "") && (
                    <input
                      value={contact.relationship}
                      onChange={(event) =>
                        setContacts((prev) => {
                          const copy = [...prev];
                          copy[index] = { ...copy[index], relationship: event.target.value };
                          return copy;
                        })
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



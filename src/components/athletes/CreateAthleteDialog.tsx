"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { athleteStatusOptions, getAthleteStatusLabel } from "@/lib/athletes/constants";
import { CATEGORY_OPTIONS, LEVEL_OPTIONS, RELATIONSHIP_OPTIONS } from "@/types/athlete-edit";

import { Modal } from "@/components/ui/modal";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import type { SportConfigOption } from "@/components/groups/types";
import type { GroupOption } from "@/types";
import { getTerminology } from "@/lib/sport-config/terminology";

interface ContactInput {
  name: string;
  email: string;
  relationship: string;
  phone: string;
  notifyEmail: boolean;
  notifySms: boolean;
}


const fieldClassName =
  "w-full rounded-card border border-border bg-card px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const compactFieldClassName =
  "rounded-card border border-border bg-card px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";

interface CreateAthleteDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  groups?: GroupOption[];
  sportConfigs?: SportConfigOption[];
  initialSportConfigId?: string;
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
  sportConfigs = [],
  initialSportConfigId,
}: CreateAthleteDialogProps) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [sportConfigId, setSportConfigId] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState<(typeof athleteStatusOptions)[number]>("active");
  const [groupId, setGroupId] = useState("");
  const [contacts, setContacts] = useState<ContactInput[]>([createEmptyContact()]);
  // El contacto familiar es obligatorio para crear el atleta y siempre está
  // visible. Las opciones deportivas menos frecuentes sí empiezan plegadas.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resolvedInitialSportConfigId = useMemo(
    () =>
      initialSportConfigId && sportConfigs.some((config) => config.id === initialSportConfigId)
        ? initialSportConfigId
        : "",
    [initialSportConfigId, sportConfigs]
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId) ?? null,
    [groupId, groups]
  );

  const effectiveSportConfigId = selectedGroup?.sportConfigId ?? sportConfigId;
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === effectiveSportConfigId) ?? null,
    [effectiveSportConfigId, sportConfigs]
  );
  const terms = getTerminology(selectedSportConfig);
  const athleteTerm = terms.athlete;
  const athleteTermLower = athleteTerm.toLowerCase();
  const groupTerm = terms.group;

  const programOptions = selectedSportConfig?.programs ?? [];
  const levelOptions = selectedSportConfig
    ? selectedSportConfig.levels.filter(
        (option) => !programCode || !option.programCode || option.programCode === programCode
      )
    : LEVEL_OPTIONS.map((option) => ({
        code: option,
        name: option === "Pre-nivel" ? "Pre-nivel" : option === "FIG" ? "FIG" : `Nivel ${option}`,
      }));
  const categoryOptions = selectedSportConfig
    ? selectedSportConfig.categories
    : CATEGORY_OPTIONS.map((option) => ({ code: option, name: option }));

  const selectedProgramName = programOptions.find((option) => option.code === programCode)?.name ?? null;
  const selectedCategoryName = categoryOptions.find((option) => option.code === category)?.name ?? null;
  const selectedLevelName = levelOptions.find((option) => option.code === level)?.name ?? null;

  const levelDisplay = [
    selectedProgramName,
    selectedCategoryName ? `${terms.category} ${selectedCategoryName}` : null,
    selectedLevelName,
  ]
    .filter(Boolean)
    .join(" · ");

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
    // Acotar a un rango plausible: descarta fechas imposibles (p.ej. año 0002 -> 2024 años).
    return ageYears >= 2 && ageYears <= 99 ? ageYears : null;
  }, [dob]);

  const computedAgeLabel = useMemo(() => {
    return computedAgeYears != null ? `${computedAgeYears} años` : "";
  }, [computedAgeYears]);

  const birthdateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || groupId || !resolvedInitialSportConfigId) {
      return;
    }
    setSportConfigId(resolvedInitialSportConfigId);
  }, [groupId, open, resolvedInitialSportConfigId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(`El nombre del ${athleteTermLower} es obligatorio.`);
      return;
    }

    if (dob) {
      const birth = new Date(dob);
      const currentYear = new Date().getFullYear();
      if (
        Number.isNaN(birth.getTime()) ||
        birth.getFullYear() < currentYear - 99 ||
        birth.getTime() > Date.now()
      ) {
        setError("La fecha de nacimiento no es válida.");
        return;
      }
    }

    const hasIncompleteContact = contacts.some(
      (contact) =>
        !contact.name.trim() ||
        !contact.email.trim() ||
        !contact.phone.trim() ||
        !contact.relationship.trim()
    );

    if (hasIncompleteContact) {
      // Si el usuario lo había contraído, vuelve a abrir el bloque junto con
      // el error para que pueda corregirlo sin tener que adivinar dónde está.
      setShowAdvanced(true);
      setError("Todos los datos del contacto familiar son obligatorios.");
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          academyId,
          name: name.trim(),
          dob: dob ? dob : undefined,
          level: levelDisplay || undefined,
          status,
          groupId: groupId || undefined,
          primarySportConfigId: effectiveSportConfigId || undefined,
          programCode: programCode || selectedGroup?.programCode || undefined,
          levelCode: level || selectedGroup?.levelCode || undefined,
          categoryCode: category || selectedGroup?.categoryCode || undefined,
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

        const response = await fetch("/api/athletes", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? `No se pudo crear el ${athleteTermLower}.`);
        }

        setName("");
        setDob("");
        setCategory("");
        setLevel("");
        setSportConfigId(resolvedInitialSportConfigId);
        setProgramCode("");
        setStatus("active");
        setGroupId("");
        setContacts([createEmptyContact()]);
        setShowAdvanced(false);
        onCreated();
        onClose();
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : "Error desconocido") ?? `Error desconocido al crear el ${athleteTermLower}.`);
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
      title={`Registrar nuevo ${athleteTermLower}`}
      description={`Añade un ${athleteTermLower} a tu academia.`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 rounded-xl border border-zaltyko-indigo px-4 py-2 text-sm font-medium text-zaltyko-indigo dark:border-zaltyko-teal dark:text-zaltyko-teal transition hover:bg-zaltyko-indigo/5 dark:hover:bg-zaltyko-teal/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="create-athlete-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-zaltyko-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando..." : `Guardar ${athleteTermLower}`}
          </button>
        </div>
      }
    >
      <form id="create-athlete-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral">
            {error}
          </div>
        )}

        {/* Campos esenciales */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">Nombre completo *</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClassName}
              placeholder="Ej: María García López"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">Fecha de nacimiento</label>
              <div className="flex items-center gap-2">
                <input
                  ref={birthdateInputRef}
                  type="date"
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={fieldClassName}
                />
                <button
                  type="button"
                  onClick={() => birthdateInputRef.current?.showPicker?.()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-zaltyko-teal hover:text-zaltyko-teal"
                  aria-label="Seleccionar fecha"
                >
                  <CalendarIcon className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              {computedAgeLabel && (
                <p className="text-xs text-muted-foreground">Edad: {computedAgeLabel}</p>
              )}
            </div>

            {groups.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">{groupTerm}</label>
                <select
                  value={groupId}
                  onChange={(event) => {
                    const nextGroupId = event.target.value;
                    const nextGroup = groups.find((group) => group.id === nextGroupId);
                    setGroupId(nextGroupId);
                    if (nextGroup?.sportConfigId) setSportConfigId(nextGroup.sportConfigId);
                    if (nextGroup?.programCode) setProgramCode(nextGroup.programCode);
                    if (nextGroup?.levelCode) setLevel(nextGroup.levelCode);
                    if (nextGroup?.categoryCode) setCategory(nextGroup.categoryCode);
                  }}
                  className={fieldClassName}
                >
                  <option value="">Sin {groupTerm.toLowerCase()}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sportConfigs.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">Modalidad / rama</label>
                <select
                  value={effectiveSportConfigId}
                  onChange={(event) => {
                    setSportConfigId(event.target.value);
                    setProgramCode("");
                    setLevel("");
                    setCategory("");
                  }}
                  className={fieldClassName}
                  disabled={Boolean(selectedGroup?.sportConfigId)}
                >
                  <option value="">Sin asignar</option>
                  {sportConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.disciplineName} · {config.branchName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Contacto familiar — requisito de alta y siempre visible */}
        <div className="space-y-3 rounded-xl border border-zaltyko-teal/25 bg-zaltyko-teal/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Datos del contacto familiar · obligatorio {contacts.length > 1 ? `(${contacts.length})` : ""}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Necesitamos una persona responsable para avisos, pagos y autorizaciones.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContacts((prev) => [...prev, createEmptyContact()])}
            className="shrink-0 rounded-full border border-zaltyko-indigo px-3 py-1.5 text-xs font-medium text-zaltyko-indigo dark:border-zaltyko-teal dark:text-zaltyko-teal transition hover:bg-zaltyko-indigo/5 dark:hover:bg-zaltyko-teal/10"
            >
              + Añadir
            </button>
          </div>

          {contacts.map((contact, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  Contacto #{index + 1}
                </p>
                {contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setContacts((prev) => prev.filter((_, contactIndex) => contactIndex !== index))
                    }
                    className="text-xs font-medium text-zaltyko-coral hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={contact.name}
                  onChange={(event) =>
                    setContacts((prev) => {
                      const copy = [...prev];
                      copy[index] = { ...copy[index], name: event.target.value };
                      return copy;
                    })
                  }
                  placeholder="Nombre *"
                  className={compactFieldClassName}
                  aria-label={`Nombre del contacto ${index + 1}`}
                  aria-required="true"
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
                  placeholder="Correo *"
                  className={compactFieldClassName}
                  aria-label={`Correo del contacto ${index + 1}`}
                  aria-required="true"
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
                  placeholder="Teléfono *"
                  className={compactFieldClassName}
                  aria-label={`Teléfono del contacto ${index + 1}`}
                  aria-required="true"
                />
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
                  className={compactFieldClassName}
                  aria-label={`Relación del contacto ${index + 1}`}
                >
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="Otro">Otro</option>
                </select>
                {!RELATIONSHIP_OPTIONS.includes(contact.relationship as any) && (
                  <input
                    value={contact.relationship}
                    onChange={(event) =>
                      setContacts((prev) => {
                        const copy = [...prev];
                        copy[index] = { ...copy[index], relationship: event.target.value };
                        return copy;
                      })
                    }
                    placeholder="Especifica la relación *"
                    className={compactFieldClassName}
                    aria-label={`Relación personalizada del contacto ${index + 1}`}
                    aria-required="true"
                    autoFocus
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <label className="inline-flex min-h-11 items-center gap-2">
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
                    className="rounded border-border text-zaltyko-teal focus:ring-zaltyko-teal"
                  />
                  Recibir correos
                </label>
                <label className="inline-flex min-h-11 items-center gap-2">
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
                    className="rounded border-border text-zaltyko-teal focus:ring-zaltyko-teal"
                  />
                  Recibir SMS
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Opciones menos frecuentes: se pueden completar después */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="athlete-advanced-fields"
          className="flex w-full items-center justify-between rounded-xl border border-border bg-zaltyko-warm-white px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-zaltyko-teal hover:text-zaltyko-teal dark:bg-slate-900"
        >
          <span>{showAdvanced ? "Ocultar opciones adicionales" : "Añadir categoría, nivel y estado (opcional)"}</span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAdvanced && (
          <div id="athlete-advanced-fields" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              {programOptions.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">Programa</label>
                  <select
                    value={programCode}
                    onChange={(event) => {
                      setProgramCode(event.target.value);
                      setLevel("");
                    }}
                    className={fieldClassName}
                  >
                    <option value="">Sin programa</option>
                    {programOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">{terms.category}</label>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Sin {terms.category.toLowerCase()}</option>
                  {categoryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">{terms.level}</label>
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Selecciona {terms.level.toLowerCase()}</option>
                  {levelOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-foreground">Estado</label>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as (typeof athleteStatusOptions)[number])
                  }
                  className={fieldClassName}
                >
                  {athleteStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {getAthleteStatusLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

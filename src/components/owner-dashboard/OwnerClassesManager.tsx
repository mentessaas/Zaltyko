"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Plus, X } from "lucide-react";

type ClassesBundle = Awaited<
  ReturnType<
    typeof import("@/modules/scheduling/application/class-management-service").getOwnerClassesPageData
  >
>;

type ScheduleSlot = {
  id: string;
  isoWeekday: number;
  startsAtLocal: string;
  endsAtLocal: string;
};

type CreateClassBody = {
  organizationId: string;
  locationId: string;
  programId: string | null;
  name: string;
  capacity: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  schedule: Array<{
    isoWeekday: number;
    startsAtLocal: string;
    endsAtLocal: string;
  }>;
};

const weekdayOptions = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

const weekdayShortLabels = [
  "",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
];

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function responseError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "No se pudo crear la clase. Inténtalo de nuevo.";
  }
  const detail = "detail" in payload ? payload.detail : undefined;
  const message = "message" in payload ? payload.message : undefined;
  return typeof detail === "string"
    ? detail
    : typeof message === "string"
      ? message
      : "No se pudo crear la clase. Inténtalo de nuevo.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function hasOverlappingSchedule(schedule: ScheduleSlot[]): boolean {
  return schedule.some((slot, index) =>
    schedule
      .slice(index + 1)
      .some(
        (next) =>
          slot.isoWeekday === next.isoWeekday &&
          slot.startsAtLocal < next.endsAtLocal &&
          next.startsAtLocal < slot.endsAtLocal
      )
  );
}

export function OwnerClassesManager({ bundle }: { bundle: ClassesBundle }) {
  const router = useRouter();
  const initialLocationId =
    bundle.selectedLocationId ?? bundle.locations[0]?.id ?? "";
  const [locationId, setLocationId] = useState(initialLocationId);
  const [programId, setProgramId] = useState(bundle.programs[0]?.id ?? "");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("12");
  const [effectiveFrom, setEffectiveFrom] = useState(
    bundle.localTodayByLocation[initialLocationId] ?? ""
  );
  const [effectiveTo, setEffectiveTo] = useState("");
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([
    {
      id: "schedule-1",
      isoWeekday: 1,
      startsAtLocal: "17:00",
      endsAtLocal: "18:00",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryRequest, setRetryRequest] = useState<{
    key: string;
    body: CreateClassBody;
  } | null>(null);
  const nextSlotId = useRef(1);

  function updateSchedule(slotId: string, patch: Partial<ScheduleSlot>) {
    setSchedule((current) =>
      current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot))
    );
    if (retryRequest) setRetryRequest(null);
  }

  function changeLocation(nextLocationId: string) {
    const currentDefaultDate = bundle.localTodayByLocation[locationId] ?? "";
    setLocationId(nextLocationId);
    if (!effectiveFrom || effectiveFrom === currentDefaultDate) {
      setEffectiveFrom(bundle.localTodayByLocation[nextLocationId] ?? "");
    }
  }

  async function sendCreate(key: string, body: CreateClassBody) {
    setBusy(true);
    setError("");
    setNotice("");
    setRetryRequest({ key, body });
    try {
      const response = await fetch("/api/v1/owner/classes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      const created = responseData<{
        id: string;
        sessionCount: number;
        generatedThrough: string;
      }>(payload);
      if (!response.ok || !created?.id) {
        setError(responseError(payload));
        if (response.status < 500) setRetryRequest(null);
        return;
      }

      setRetryRequest(null);
      setName("");
      setEffectiveTo("");
      setNotice(
        `Clase creada con ${created.sessionCount} sesiones preparadas hasta el ${formatDate(created.generatedThrough)}.`
      );
      router.refresh();
    } catch {
      setError(
        "No sabemos si se guardó. Reintenta este mismo envío; la clave segura evita duplicar la clase."
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryRequest) {
      void sendCreate(retryRequest.key, retryRequest.body);
      return;
    }
    setError("");
    setNotice("");

    const parsedCapacity = Number(capacity);
    if (
      !locationId ||
      !programId ||
      name.trim().length < 2 ||
      !Number.isInteger(parsedCapacity) ||
      parsedCapacity < 1 ||
      !effectiveFrom ||
      hasOverlappingSchedule(schedule) ||
      schedule.some(
        (slot) =>
          !slot.startsAtLocal ||
          !slot.endsAtLocal ||
          slot.endsAtLocal <= slot.startsAtLocal
      )
    ) {
      setError(
        hasOverlappingSchedule(schedule)
          ? "No superpongas dos horarios del mismo día."
          : "Revisa la actividad, la sede y los datos de la clase."
      );
      return;
    }

    const body: CreateClassBody = {
      organizationId: bundle.organization.id,
      locationId,
      programId,
      name: name.trim(),
      capacity: parsedCapacity,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
      schedule: schedule.map(({ isoWeekday, startsAtLocal, endsAtLocal }) => ({
        isoWeekday,
        startsAtLocal,
        endsAtLocal,
      })),
    };
    void sendCreate(`owner-class:${crypto.randomUUID()}`, body);
  }

  const formLocked = busy || retryRequest !== null;
  const canCreate = bundle.locations.length > 0 && bundle.programs.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/owner?organizationId=${bundle.organization.id}`}
            className="touch-target inline-flex items-center text-sm font-semibold text-teal-900 underline underline-offset-4"
          >
            <span>Volver al resumen</span>
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            Clases recurrentes
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
            Define la actividad, el horario semanal y las plazas una sola vez.
            Zaltyko prepara las sesiones próximas.
          </p>
        </div>
        <Link
          href={`/owner/groups?organizationId=${bundle.organization.id}`}
          className="touch-target inline-flex min-h-11 items-center gap-2 border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
        >
          Grupos <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="mb-5 border border-teal-700 bg-teal-50 p-4 text-sm text-teal-950"
        >
          {notice}
        </p>
      )}

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mb-5 border border-rose-700 bg-rose-50 p-4 text-sm text-rose-950"
        >
          {error}
        </p>
      )}

      {!canCreate ? (
        <section className="border border-slate-300 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950">
            Falta un dato para crear clases
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-700">
            {bundle.locations.length === 0
              ? "No hay sedes activas a las que tengas acceso."
              : "Antes configura una actividad de la academia, como gimnasia artística, rítmica o una actividad complementaria."}
          </p>
          <Link
            href={`/owner/setup?organizationId=${bundle.organization.id}`}
            className={`${primaryButtonClassName} mt-5`}
          >
            Revisar configuración
          </Link>
        </section>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <form
            onSubmit={submit}
            aria-label="Crear clase recurrente"
            className="grid gap-5 border border-slate-300 bg-white p-5 sm:p-7"
          >
            <h2 className="text-xl font-bold text-slate-950">
              Crear una clase
            </h2>
            <p className="-mt-3 text-sm leading-6 text-slate-700">
              Una clase tiene actividad, sede, horario y capacidad. Los grupos y
              las matrículas se gestionan por separado.
            </p>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-900">
                Actividad
              </span>
              <select
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                disabled={formLocked}
                required
                className={fieldClassName}
              >
                {bundle.programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-5 text-slate-600">
                Incluye gimnasia artística, rítmica y las actividades
                complementarias configuradas.
              </span>
            </label>

            {bundle.locations.length > 1 && (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-900">Sede</span>
                <select
                  value={locationId}
                  onChange={(event) => changeLocation(event.target.value)}
                  disabled={formLocked}
                  required
                  className={fieldClassName}
                >
                  {bundle.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-900">
                Nombre de la clase
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={formLocked}
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-2 sm:max-w-xs">
              <span className="text-sm font-bold text-slate-900">
                Plazas disponibles
              </span>
              <input
                type="number"
                min={1}
                max={5000}
                step={1}
                inputMode="numeric"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                disabled={formLocked}
                required
                className={fieldClassName}
              />
            </label>

            <fieldset className="grid gap-3 border-t border-slate-200 pt-5">
              <legend className="pr-2 text-sm font-bold text-slate-900">
                Horario semanal
              </legend>
              {schedule.map((slot, index) => (
                <div
                  key={slot.id}
                  className="grid gap-3 border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                >
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Día {index + 1}
                    </span>
                    <select
                      value={slot.isoWeekday}
                      onChange={(event) =>
                        updateSchedule(slot.id, {
                          isoWeekday: Number(event.target.value),
                        })
                      }
                      disabled={formLocked}
                      className={fieldClassName}
                    >
                      {weekdayOptions.map((weekday) => (
                        <option key={weekday.value} value={weekday.value}>
                          {weekday.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Empieza
                    </span>
                    <input
                      type="time"
                      value={slot.startsAtLocal}
                      onChange={(event) =>
                        updateSchedule(slot.id, {
                          startsAtLocal: event.target.value,
                        })
                      }
                      disabled={formLocked}
                      required
                      className={fieldClassName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Termina
                    </span>
                    <input
                      type="time"
                      value={slot.endsAtLocal}
                      onChange={(event) =>
                        updateSchedule(slot.id, {
                          endsAtLocal: event.target.value,
                        })
                      }
                      disabled={formLocked}
                      required
                      className={fieldClassName}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Eliminar horario ${weekdayOptions.find((day) => day.value === slot.isoWeekday)?.label ?? "semanal"}`}
                    onClick={() =>
                      setSchedule((current) =>
                        current.length > 1
                          ? current.filter((item) => item.id !== slot.id)
                          : current
                      )
                    }
                    disabled={formLocked || schedule.length === 1}
                    className="touch-target inline-flex min-h-11 min-w-11 items-center justify-center border border-slate-400 bg-white text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  nextSlotId.current += 1;
                  setSchedule((current) => [
                    ...current,
                    {
                      id: `schedule-${nextSlotId.current}`,
                      isoWeekday: 2,
                      startsAtLocal: "17:00",
                      endsAtLocal: "18:00",
                    },
                  ]);
                }}
                disabled={formLocked || schedule.length >= 14}
                className="touch-target inline-flex min-h-11 w-fit items-center gap-2 border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Añadir otro horario
              </button>
            </fieldset>

            <div className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-900">
                  Empieza el
                </span>
                <input
                  type="date"
                  value={effectiveFrom}
                  min={bundle.localTodayByLocation[locationId]}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  disabled={formLocked}
                  required
                  className={fieldClassName}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-900">
                  Último día (opcional)
                </span>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                  disabled={formLocked}
                  min={effectiveFrom}
                  className={fieldClassName}
                />
              </label>
            </div>

            <p className="border-l-2 border-teal-700 pl-3 text-xs leading-5 text-slate-700">
              Al guardar se crean la clase recurrente y sus sesiones de hasta
              los próximos 120 días. No se crean matrículas ni cobros.
            </p>

            <button
              type="submit"
              disabled={busy || !canCreate}
              className={primaryButtonClassName}
            >
              {busy
                ? "Guardando…"
                : retryRequest
                  ? "Reintentar el mismo envío"
                  : "Crear clase y sesiones"}
            </button>
          </form>

          <section aria-labelledby="classes-list-title" className="min-w-0">
            <h2
              id="classes-list-title"
              className="text-xl font-bold text-slate-950"
            >
              Clases de tu academia
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Las sesiones se generan según la zona horaria de cada sede.
            </p>
            {bundle.classes.length === 0 ? (
              <p className="mt-5 border border-slate-300 bg-white p-5 text-sm leading-6 text-slate-700">
                Aún no hay clases recurrentes. Crea la primera para organizar
                entrenamientos y preparar el calendario.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-300 bg-white">
                {bundle.classes.map((classItem) => (
                  <li key={classItem.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-950">
                          {classItem.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-700">
                          {classItem.programName ?? "Actividad sin clasificar"}{" "}
                          · {classItem.locationName}
                        </p>
                      </div>
                      <span className="shrink-0 border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800">
                        {classItem.capacity} plazas
                      </span>
                    </div>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {classItem.schedule.map((slot) => (
                        <li
                          key={`${slot.isoWeekday}-${slot.startsAtLocal}`}
                          className="bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-800"
                        >
                          {weekdayShortLabels[slot.isoWeekday]} ·{" "}
                          {slot.startsAtLocal.slice(0, 5)}–
                          {slot.endsAtLocal.slice(0, 5)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs leading-5 text-slate-600">
                      Desde {formatDate(classItem.effectiveFrom)}
                      {classItem.effectiveTo
                        ? ` hasta ${formatDate(classItem.effectiveTo)}`
                        : " · sin fecha de fin"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

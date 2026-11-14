"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Repeat2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import type {
  OwnerCalendarData,
  OwnerCalendarSession,
} from "@/modules/scheduling/application/calendar-sessions";
import {
  CALENDAR_VIEWS,
  calendarRange,
  daysInRange,
  formatRangeTitle,
  groupSessionsByLocalDate,
  localTimeOf,
  monthWeeks,
  shiftAnchor,
  todayIn,
  type CalendarView,
} from "@/modules/scheduling/domain/calendar";
import {
  calendarApiParams,
  calendarSearchParams,
  coachLine,
  groupsLine,
  isOverCapacity,
  occupancyLabel,
  occupancyPercent,
  sessionAttendanceHref,
  type OwnerCalendarState,
} from "./owner-calendar-ui";
import { ownerDisciplineOf, ownerDisciplineStyle, ownerTab, ownerTone, ownerUi } from "./owner-ui";

const VIEW_LABELS: Record<CalendarView, string> = { day: "Día", week: "Semana", month: "Mes" };
const PREVIOUS_LABELS: Record<CalendarView, string> = {
  day: "Día anterior",
  week: "Semana anterior",
  month: "Mes anterior",
};
const NEXT_LABELS: Record<CalendarView, string> = {
  day: "Día siguiente",
  week: "Semana siguiente",
  month: "Mes siguiente",
};
const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_CELL_PREVIEW = 3;

export interface OwnerCalendarViewProps {
  organizationId: string;
  initialState: OwnerCalendarState;
  /** Sedes del alcance de quien mira (la página ya las autorizó). */
  locations: Array<{ id: string; name: string; timezone: string }>;
  /** Zona horaria con la que se decide «hoy» (la de la sede de referencia). */
  referenceTimeZone: string;
  /** «Hoy» calculado en el servidor, para que el primer pintado coincida. */
  todayLocal: string;
  /** Datos del primer rango, leídos en el servidor; null si la lectura falló. */
  initialData: OwnerCalendarData | null;
}

function formatDay(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-ES", { ...options, timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00.000Z`)
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("es") + value.slice(1);
}

function cacheKey(state: Pick<OwnerCalendarState, "locationId" | "groupId">, range: { from: string; to: string }) {
  return `${state.locationId}|${state.groupId}|${range.from}|${range.to}`;
}

async function problemDetail(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof body?.detail === "string" && body.detail
    ? body.detail
    : "No pudimos cargar el calendario. Inténtalo de nuevo.";
}

function SessionStatusChips({ session }: { session: OwnerCalendarSession }) {
  const cancelled = session.status === "cancelled";
  return (
    <>
      {cancelled ? <span className={ownerTone.chipRest}>Cancelada</span> : null}
      {!cancelled && session.substitution ? (
        <span className={ownerTone.chipWarning}>
          <Repeat2 aria-hidden="true" className="mr-1 h-3 w-3" />
          Sustitución
        </span>
      ) : null}
      {!cancelled && session.recordedAttendance > 0 ? (
        <span className={ownerTone.chipSuccess}>
          <Check aria-hidden="true" className="mr-1 h-3 w-3" />
          Lista pasada
        </span>
      ) : null}
    </>
  );
}

function SessionBody({
  session,
  showLocation,
}: {
  session: OwnerCalendarSession;
  showLocation: boolean;
}) {
  const cancelled = session.status === "cancelled";
  const coaches = coachLine(session);
  const groups = groupsLine(session);
  const over = isOverCapacity(session);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-display text-sm font-bold tabular-nums text-z-ink">
          {localTimeOf(session.startsAt, session.timezone)}–{localTimeOf(session.endsAt, session.timezone)}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          <SessionStatusChips session={session} />
        </span>
      </div>
      <p className={`mt-1 break-words text-sm font-semibold text-z-ink ${cancelled ? "line-through" : ""}`}>
        {session.className}
      </p>
      <p className="break-words text-xs text-z-soft">
        {[groups, showLocation ? session.locationName : null].filter(Boolean).join(" · ") ||
          session.programName ||
          "Sin grupo asignado"}
      </p>
      {coaches ? (
        <p className="mt-0.5 break-words text-xs text-z-ink">
          {session.coachNames && session.coachNames.length > 0 ? `Entrena: ${coaches}` : coaches}
        </p>
      ) : null}
      {cancelled ? null : (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={over ? "font-semibold text-ochre-ink" : "text-z-soft"}>
              <span className="sr-only">
                {session.expectedAthletes} inscritas de {session.capacity} plazas
              </span>
              <span aria-hidden="true" className="tabular-nums">
                {occupancyLabel(session)} inscritas
              </span>
            </span>
          </div>
          <div aria-hidden="true" className={`mt-1 ${ownerUi.meterTrack}`}>
            <div
              className={`h-full ${over ? "bg-ochre" : "bg-mat"}`}
              style={{ width: `${occupancyPercent(session)}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function SessionItem({
  organizationId,
  session,
  showLocation,
  layout,
}: {
  organizationId: string;
  session: OwnerCalendarSession;
  showLocation: boolean;
  layout: "card" | "row";
}) {
  const discipline = ownerDisciplineStyle[ownerDisciplineOf(session.programName)];
  const cancelled = session.status === "cancelled";
  const base =
    layout === "card"
      ? `relative block min-w-0 overflow-hidden rounded-md border border-z-line py-2.5 pl-4 pr-3 ${cancelled ? "bg-z-canvas" : "bg-white"}`
      : "relative block min-w-0 overflow-hidden py-3.5 pl-6 pr-5";
  const interactive = cancelled
    ? ""
    : " transition-colors hover:bg-z-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-z-brand-500";
  const bar = (
    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${discipline.bar} ${cancelled ? "opacity-40" : ""}`} />
  );
  const body = <SessionBody session={session} showLocation={showLocation} />;
  const time = localTimeOf(session.startsAt, session.timezone);

  if (cancelled) {
    return (
      <div className={`${base} ${layout === "row" ? "bg-z-canvas" : ""}`}>
        {bar}
        {body}
      </div>
    );
  }
  return (
    <Link
      href={sessionAttendanceHref(organizationId, session)}
      aria-label={`Abrir la asistencia de ${session.className} a las ${time}`}
      className={`${base}${interactive}`}
    >
      {bar}
      {body}
    </Link>
  );
}

function EmptyRange({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span aria-hidden="true" className={ownerUi.emptyIcon}>
        <CalendarDays className="h-5 w-5" />
      </span>
      <p className="max-w-sm text-sm leading-6 text-z-soft">{message}</p>
    </div>
  );
}

export function OwnerCalendarView({
  organizationId,
  initialState,
  locations,
  referenceTimeZone,
  todayLocal,
  initialData,
}: OwnerCalendarViewProps) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<OwnerCalendarState>(initialState);
  const [selectedDay, setSelectedDay] = useState(initialState.date);
  const [today, setToday] = useState(todayLocal);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [data, setData] = useState<{ key: string; value: OwnerCalendarData } | null>(() =>
    initialData
      ? { key: cacheKey(initialState, calendarRange(initialState.view, initialState.date)), value: initialData }
      : null
  );
  const [groupOptions, setGroupOptions] = useState(initialData?.groups ?? []);
  const [status, setStatus] = useState<"ready" | "loading" | "error">(initialData ? "ready" : "loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, OwnerCalendarData>());
  if (initialData && cache.current.size === 0) {
    cache.current.set(cacheKey(initialState, calendarRange(initialState.view, initialState.date)), initialData);
  }

  const range = useMemo(() => calendarRange(state.view, state.date), [state.view, state.date]);
  const key = cacheKey(state, range);

  // «Hoy» se vuelve a calcular en el navegador con la zona de la sede.
  useEffect(() => {
    setToday(todayIn(referenceTimeZone));
  }, [referenceTimeZone]);

  // Lectura por rango con caché por (sede, grupo, rango); cancela la anterior.
  useEffect(() => {
    const cached = cache.current.get(key);
    if (cached) {
      setData({ key, value: cached });
      setStatus("ready");
      return;
    }
    const controller = new AbortController();
    // Una respuesta que llega tarde no pisa la del rango que se ve ahora.
    let active = true;
    setStatus("loading");
    fetch(
      `/api/v1/owner/calendar?${calendarApiParams({
        organizationId,
        from: range.from,
        to: range.to,
        locationId: state.locationId,
        groupId: state.groupId,
      })}`,
      { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await problemDetail(response));
        const body = (await response.json()) as { data?: OwnerCalendarData };
        if (!body.data) throw new Error("No pudimos cargar el calendario. Inténtalo de nuevo.");
        return body.data;
      })
      .then((value) => {
        if (!active) return;
        cache.current.set(key, value);
        setData({ key, value });
        setGroupOptions(value.groups);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "No pudimos cargar el calendario.");
        setStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
    // `retry` fuerza una nueva lectura tras un error.
  }, [key, retry, organizationId, range.from, range.to, state.locationId, state.groupId]);

  // La vista queda en la URL (vista, fecha, sede y grupo) sin recargar.
  useEffect(() => {
    try {
      window.history.replaceState(
        null,
        "",
        `/owner/calendar?${calendarSearchParams(organizationId, state, today)}`
      );
    } catch {
      // Sin historial (vista previa o entorno restringido): la pantalla sigue igual.
    }
  }, [organizationId, state, today]);

  const sessions = useMemo(
    () => (data && data.key === key ? data.value.sessions : []),
    [data, key]
  );
  const byDay = useMemo(() => groupSessionsByLocalDate(sessions), [sessions]);
  const days = useMemo(() => daysInRange(range), [range]);
  const loading = status === "loading";
  const showLocation = !state.locationId && locations.length > 1;
  const groupsForLocation = groupOptions.filter(
    (group) => !state.locationId || group.locationId === state.locationId
  );
  const truncated = data?.key === key && data.value.truncated;

  const move = useCallback(
    (next: Partial<OwnerCalendarState>, nextDirection: -1 | 0 | 1) => {
      setDirection(nextDirection);
      setState((current) => ({ ...current, ...next }));
      if (next.date) setSelectedDay(next.date);
    },
    []
  );

  const goTo = (step: -1 | 1) => move({ date: shiftAnchor(state.view, state.date, step) }, step);
  const goToday = () => move({ date: today }, today === state.date ? 0 : today > state.date ? 1 : -1);
  const changeView = (view: CalendarView) => move({ view }, 0);
  const changeLocation = (locationId: string) => {
    const stillValid = groupOptions.some(
      (group) => group.id === state.groupId && (!locationId || group.locationId === locationId)
    );
    move({ locationId, groupId: stillValid ? state.groupId : "" }, 0);
  };
  const changeGroup = (groupId: string) => move({ groupId }, 0);

  const renderCards = (daySessions: OwnerCalendarSession[]) =>
    daySessions.map((session) => (
      <SessionItem
        key={session.id}
        organizationId={organizationId}
        session={session}
        showLocation={showLocation}
        layout="card"
      />
    ));

  const dayList = (day: string, emptyMessage: string) => {
    const daySessions = byDay.get(day) ?? [];
    return daySessions.length === 0 ? (
      <EmptyRange message={emptyMessage} />
    ) : (
      <ul className="divide-y divide-z-line">
        {daySessions.map((session) => (
          <li key={session.id}>
            <SessionItem
              organizationId={organizationId}
              session={session}
              showLocation={showLocation}
              layout="row"
            />
          </li>
        ))}
      </ul>
    );
  };

  const dayHeading = (day: string) => capitalize(formatDay(day, { weekday: "long", day: "numeric", month: "long" }));

  let body: React.ReactNode;
  if (state.view === "day") {
    body = (
      <section aria-label={dayHeading(state.date)} className={ownerUi.cardFlush}>
        {dayList(state.date, loading ? "Cargando sesiones…" : "No hay sesiones este día.")}
      </section>
    );
  } else if (state.view === "week") {
    // Móvil y tableta: una lista por días, de arriba abajo. Escritorio: siete columnas.
    body = (
      <div className="grid gap-3 lg:grid-cols-7 lg:items-start lg:gap-2">
        {days.map((day) => {
          const daySessions = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <section
              key={day}
              aria-label={dayHeading(day)}
              className={`min-w-0 overflow-hidden rounded-xl border border-z-line border-t-[3px] bg-white ${isToday ? "border-t-mat" : "border-t-z-ink"}`}
            >
              <h3 className="flex items-baseline justify-between gap-2 border-b border-z-line px-3 py-2">
                <span className="flex items-baseline gap-2">
                  <span className="floor-label text-z-soft">
                    {capitalize(formatDay(day, { weekday: "short" }).replace(".", ""))}
                  </span>
                  {isToday ? <span className={ownerTone.chipLive}>Hoy</span> : null}
                </span>
                <span className={`font-display text-xl font-black tabular-nums ${isToday ? "text-mat" : "text-z-ink"}`}>
                  {formatDay(day, { day: "numeric" })}
                </span>
              </h3>
              <div className="grid gap-2 p-2">
                {daySessions.length === 0 ? (
                  <p className="px-1 py-1.5 text-xs text-z-soft">{loading ? "Cargando…" : "Sin sesiones"}</p>
                ) : (
                  renderCards(daySessions)
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  } else {
    const weeks = monthWeeks(range);
    const month = state.date.slice(0, 7);
    body = (
      <div className="grid gap-4">
        <div className="overflow-hidden rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white">
          <ul aria-hidden="true" className="grid grid-cols-7 border-b border-z-line bg-z-canvas">
            {WEEKDAY_SHORT.map((label) => (
              <li key={label} className="floor-label px-1 py-2 text-center text-z-soft sm:px-2 sm:text-left">
                {label}
              </li>
            ))}
          </ul>
          {weeks.map((week) => (
            <ol key={week[0]} className="grid grid-cols-7 border-b border-z-line last:border-b-0">
              {week.map((day) => {
                const daySessions = byDay.get(day) ?? [];
                const inMonth = day.startsWith(month);
                const isToday = day === today;
                const selected = day === selectedDay;
                return (
                  <li key={day} className="min-w-0 border-r border-z-line last:border-r-0">
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${dayHeading(day)}: ${daySessions.length === 0 ? "sin sesiones" : `${daySessions.length} ${daySessions.length === 1 ? "sesión" : "sesiones"}`}`}
                      onClick={() => setSelectedDay(day)}
                      className={`flex min-h-[4.25rem] w-full min-w-0 flex-col items-center gap-1 px-1 py-1.5 text-left transition-colors sm:min-h-[6.5rem] sm:items-stretch sm:px-2 ${selected ? "bg-mat-wash" : "hover:bg-z-brand-50"} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-z-brand-500`}
                    >
                      <span
                        className={`font-display text-sm font-black tabular-nums sm:text-base ${isToday ? "text-mat" : inMonth ? "text-z-ink" : "text-z-soft/60"}`}
                      >
                        {formatDay(day, { day: "numeric" })}
                        {isToday ? <span className="sr-only"> (hoy)</span> : null}
                      </span>
                      {daySessions.length > 0 ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="rounded-md bg-mat px-1.5 text-[11px] font-bold tabular-nums text-white sm:hidden"
                          >
                            {daySessions.length}
                          </span>
                          <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                            {daySessions.slice(0, MONTH_CELL_PREVIEW).map((session) => (
                              <span
                                key={session.id}
                                className={`flex min-w-0 items-center gap-1 text-[11px] leading-4 text-z-ink ${session.status === "cancelled" ? "line-through opacity-60" : ""}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-sm ${ownerDisciplineStyle[ownerDisciplineOf(session.programName)].dot}`}
                                />
                                <span className="shrink-0 tabular-nums">
                                  {localTimeOf(session.startsAt, session.timezone)}
                                </span>
                                <span className="truncate">{session.className}</span>
                              </span>
                            ))}
                            {daySessions.length > MONTH_CELL_PREVIEW ? (
                              <span className="text-[11px] font-semibold text-mat-deep">
                                +{daySessions.length - MONTH_CELL_PREVIEW} más
                              </span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          ))}
        </div>
        <section aria-labelledby="owner-calendar-selected-day" className={ownerUi.cardFlush}>
          <div className={ownerUi.cardHeader}>
            <h3 id="owner-calendar-selected-day" className={ownerUi.sectionTitle}>
              {dayHeading(selectedDay)}
            </h3>
            <button
              type="button"
              onClick={() => move({ view: "day", date: selectedDay }, 0)}
              className={`${ownerUi.textLink} shrink-0`}
            >
              Ver el día
            </button>
          </div>
          {dayList(selectedDay, loading ? "Cargando sesiones…" : "No hay sesiones este día.")}
        </section>
      </div>
    );
  }

  const motionVariants = {
    enter: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -28 }),
  };

  const totalInRange = sessions.length;

  return (
    <main className={ownerUi.page}>
      <PageHeader
        title="Calendario"
        description="Las clases que tocan, por día, semana o mes. Toca una sesión para pasar lista."
        actions={
          <Link href={`/owner/classes?${new URLSearchParams({ organizationId })}`} className={ownerUi.secondaryButton}>
            Gestionar clases
          </Link>
        }
      />

      <div className="mt-5 grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div role="group" aria-label="Vista del calendario" className={ownerTone.tabList}>
            {CALENDAR_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={state.view === view}
                onClick={() => changeView(view)}
                className={ownerTab(state.view === view)}
              >
                {VIEW_LABELS[view]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {locations.length > 1 ? (
              <label className="grid min-w-44 gap-1">
                <span className={ownerUi.smallLabel}>Sede</span>
                <select
                  value={state.locationId}
                  onChange={(event) => changeLocation(event.target.value)}
                  className={ownerUi.field}
                >
                  <option value="">Todas las sedes</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {groupsForLocation.length > 0 ? (
              <label className="grid min-w-44 gap-1">
                <span className={ownerUi.smallLabel}>Grupo</span>
                <select
                  value={state.groupId}
                  onChange={(event) => changeGroup(event.target.value)}
                  className={ownerUi.field}
                >
                  <option value="">Todos los grupos</option>
                  {groupsForLocation.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(-1)}
            aria-label={PREVIOUS_LABELS[state.view]}
            className={`${ownerUi.secondaryButton} px-3`}
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(1)}
            aria-label={NEXT_LABELS[state.view]}
            className={`${ownerUi.secondaryButton} px-3`}
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
          <button type="button" onClick={goToday} className={ownerUi.secondaryButton}>
            Hoy
          </button>
          <h2
            aria-live="polite"
            className="ml-1 min-w-0 break-words font-display text-xl font-black uppercase leading-none text-z-ink sm:text-2xl"
          >
            {formatRangeTitle(state.view, state.date)}
          </h2>
          <span role="status" className="text-xs text-z-soft">
            {loading ? "Cargando sesiones…" : status === "ready" ? `${totalInRange} ${totalInRange === 1 ? "sesión" : "sesiones"}` : ""}
          </span>
        </div>

        {status === "error" ? (
          <div role="alert" className={`${ownerTone.noticeError} flex flex-wrap items-center justify-between gap-3`}>
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => {
                cache.current.delete(key);
                setRetry((value) => value + 1);
              }}
              className={ownerUi.secondaryButton}
            >
              Reintentar
            </button>
          </div>
        ) : null}
        {truncated ? (
          <p className={ownerTone.noticeWarning}>
            Hay más sesiones de las que mostramos en este rango. Filtra por sede o grupo, o cambia a una vista más corta.
          </p>
        ) : null}

        <div aria-busy={loading} className={loading ? "opacity-70 transition-opacity" : "transition-opacity"}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={`${state.view}:${range.from}`}
              custom={direction}
              variants={motionVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </div>

        {status === "ready" && totalInRange === 0 && state.view !== "day" ? (
          <p className="text-sm leading-6 text-z-soft">
            No hay sesiones en este periodo con los filtros actuales. Las sesiones se generan desde tus clases recurrentes.
          </p>
        ) : null}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import type { CommercialPlanSlug } from "@/lib/growth/contracts";
import { MARKET_ACCESS_DISCIPLINES, MARKET_ACCESS_ROLES } from "@/lib/growth/market-access";
import {
  capturePublicGrowthEvent,
  getPublicAttribution,
} from "@/lib/growth/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const reasons = [
  { value: "demo", label: "Solicitar demo" },
  { value: "network", label: "Varias sedes o academias" },
  { value: "sales", label: "Información de ventas" },
  { value: "migracion", label: "Migrar datos o coordinar varias sedes" },
  { value: "support", label: "Soporte técnico" },
  { value: "billing", label: "Cobros" },
  { value: "partnership", label: "Colaboración" },
  { value: "market_access", label: "Acceso para un país no disponible" },
  { value: "other", label: "Otro" },
];

type SubmitState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

interface ContactFormProps {
  defaultReason?: string;
  defaultPlan?: string;
  directoryEntryId?: string;
}

const publicPlans = new Set<CommercialPlanSlug>(["free", "starter", "growth", "network"]);
const CONTACT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Campo del sistema: 44 px, blanco, borde de rampa, 10 px de radio y foco en
 * azul tapiz con anillo de 4 px al 15 %. 16 px de letra para que iOS no haga
 * zoom. En oscuro se apoya en las superficies del tema.
 */
const FIELD_CLASS =
  "w-full rounded-card border border-ramp-300 bg-white px-4 text-base font-normal text-mat-night placeholder:text-ramp-500 transition-colors duration-150 focus:border-mat focus:outline-none focus:ring-4 focus:ring-mat/15 dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground";
const LABEL_CLASS = "block text-sm font-semibold text-mat-night";

function captureContactEvent(input: Parameters<typeof capturePublicGrowthEvent>[0]) {
  try {
    capturePublicGrowthEvent(input);
  } catch {
    // Browser restrictions on analytics must not block the contact request.
  }
}

export function ContactForm({ defaultReason = "demo", defaultPlan, directoryEntryId }: ContactFormProps) {
  const directoryId = directoryEntryId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(directoryEntryId) ? directoryEntryId : undefined;
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const initialReason = reasons.some((item) => item.value === defaultReason) ? defaultReason : "demo";
  const [selectedReason, setSelectedReason] = useState(initialReason);
  const submitLock = useRef(false);
  // Kept only in memory: an unchanged retry reuses the exact request after a lost response.
  const lastRequest = useRef<{ fingerprint: string; body: string } | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    captureContactEvent({
      eventName: "contact_started",
      planCode: publicPlans.has(defaultPlan as CommercialPlanSlug)
        ? (defaultPlan as CommercialPlanSlug)
        : null,
      source: "public_contact",
      properties: getPublicAttribution(),
    });
  }, [defaultPlan]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const reason = String(formData.get("reason") ?? "demo");
    if (reason === "market_access" && formData.getAll("marketDisciplines").length === 0) {
      setState({ status: "error", message: "Elige al menos una disciplina o actividad del club." });
      form.querySelector<HTMLInputElement>('input[name="marketDisciplines"]')?.focus();
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setState({ status: "idle" });

    const academy = String(formData.get("academy") ?? "").trim();
    const plan = publicPlans.has(defaultPlan as CommercialPlanSlug)
      ? (defaultPlan as CommercialPlanSlug)
      : null;

    // Telemetria: registrar el intento de envio ANTES del fetch para distinguir
    // "no llego a pulsar enviar" (sin attempted) de "rompio entre pulsar y servidor" (con attempted pero sin submitted).
    captureContactEvent({
      eventName: "contact_submit_attempted",
      planCode: plan,
      source: "public_contact",
      properties: {
        ...getPublicAttribution(),
        reason,
        has_academy: Boolean(academy),
        honeypot_filled: Boolean(formData.get("company")),
      },
    });

    let failureReported = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONTACT_REQUEST_TIMEOUT_MS);

    try {
      const fields = {
        name: formData.get("name"),
        email: formData.get("email"),
        academy: academy || null,
        reason,
        plan,
        source: directoryId ? "directory" : "public_contact",
        ...(directoryId ? { directoryEntryId: directoryId } : {}),
        message: formData.get("message"),
        honeypot: formData.get("company"),
        ...(reason === "market_access" ? {
          marketAccess: {
            countryName: String(formData.get("countryName") ?? "").trim(),
            role: String(formData.get("marketRole") ?? ""),
            disciplines: formData.getAll("marketDisciplines").map(String),
          },
        } : {}),
      };
      const fingerprint = JSON.stringify(fields);
      let pendingRequest = lastRequest.current;
      if (!pendingRequest || pendingRequest.fingerprint !== fingerprint) {
        // ContactRequestSchema requires a UUID. Scope it to this one request,
        // and reuse it only while retrying the exact same pending payload.
        const submissionId = crypto.randomUUID();
        pendingRequest = {
          fingerprint,
          body: JSON.stringify({ ...fields, submissionId, visitorId: submissionId }),
        };
        lastRequest.current = pendingRequest;
      }

      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pendingRequest.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const serverCode =
          payload && typeof payload === "object" && "code" in payload
            ? String((payload as { code: unknown }).code)
            : "unknown";
        const statusBucket = response.status >= 500 ? "5xx" : "4xx";
        captureContactEvent({
          eventName: "contact_submit_failed",
          planCode: plan,
          source: "public_contact",
          properties: {
            ...getPublicAttribution(),
            reason,
            status: response.status,
            status_bucket: statusBucket,
            server_code: serverCode,
          },
        });
        failureReported = true;
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo enviar el mensaje.");
      }

      form.reset();
      lastRequest.current = null;
      setSelectedReason(initialReason);
      setState({
        status: "success",
        message: reason === "market_access"
          ? "Solicitud guardada. Revisaremos la disponibilidad para tu país y te responderemos por correo."
          : "Mensaje enviado. Te responderemos desde el equipo de Zaltyko.",
      });
    } catch (error) {
      if (!failureReported) {
        // No llegamos al servidor o el fetch tiro antes de obtener respuesta.
        captureContactEvent({
          eventName: "contact_submit_failed",
          planCode: plan,
          source: "public_contact",
          properties: {
            ...getPublicAttribution(),
            reason,
            status_bucket: "network",
            server_code: "client_exception",
          },
        });
      }
      setState({
        status: "error",
        message:
          error instanceof DOMException && error.name === "AbortError"
            ? "La solicitud está tardando demasiado. Comprueba tu conexión e inténtalo de nuevo."
            : error instanceof Error
              ? error.message
              : "No se pudo enviar el mensaje.",
      });
    } finally {
      window.clearTimeout(timeoutId);
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Formulario de contacto"
    >
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {publicPlans.has(defaultPlan as CommercialPlanSlug) && (
        <p className="rounded-md border border-chalk-line bg-mat-wash px-4 py-3 text-sm text-mat-deep">
          Interés seleccionado: <strong className="capitalize">{defaultPlan}</strong>
        </p>
      )}
      <div>
        <label htmlFor="name" className={LABEL_CLASS}>
          Nombre completo
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          autoComplete="name"
          className={cn(FIELD_CLASS, "mt-1 block h-11")}
          placeholder="Tu nombre"
        />
      </div>

      <div>
        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          autoComplete="email"
          className={cn(FIELD_CLASS, "mt-1 block h-11")}
          placeholder="tu@email.com"
        />
      </div>

      <div>
        <label htmlFor="reason" className={LABEL_CLASS}>
          Motivo de contacto
        </label>
        <select
          id="reason"
          name="reason"
          required
          value={selectedReason}
          onChange={(event) => setSelectedReason(event.target.value)}
          className={cn(FIELD_CLASS, "mt-1 block h-11")}
        >
          {reasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>

      {selectedReason === "market_access" && (
        <fieldset className="grid min-w-0 gap-4 rounded-card border border-chalk-line bg-chalk p-4">
          <legend className="px-1 font-semibold text-mat-night">Acceso asistido para tu club</legend>
          <p className="text-sm text-ramp-600">
            Indica el país real del club. Evaluaremos qué gestión podemos ofrecerte;
            esta solicitud no crea una academia ni contrata un plan. No hay una fecha de apertura comprometida.
          </p>
          <label className="grid gap-2 text-sm font-semibold text-mat-night">
            País del club
            <input name="countryName" required minLength={2} maxLength={80} autoComplete="country-name"
              placeholder="Por ejemplo, Argentina" className={cn(FIELD_CLASS, "touch-target min-w-0")} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-mat-night">
            Tu función en el club
            <select name="marketRole" required defaultValue=""
              className={cn(FIELD_CLASS, "touch-target min-w-0")}>
              <option value="" disabled>Selecciona tu función</option>
              {MARKET_ACCESS_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <fieldset className="grid min-w-0 gap-2" aria-describedby="market-disciplines-help">
            <legend className="mb-2 text-sm font-semibold text-mat-night">Disciplinas o actividades del club</legend>
            <p id="market-disciplines-help" className="text-sm text-ramp-600">Elige al menos una opción.</p>
            {MARKET_ACCESS_DISCIPLINES.map((item) => (
              <label key={item.value} className="flex min-h-11 items-center gap-3 text-sm text-mat-night">
                <input type="checkbox" name="marketDisciplines" value={item.value} className="h-4 w-4 accent-mat" />
                {item.label}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-ramp-600">
            Usa tus datos profesionales de contacto. No incluyas datos de gimnastas menores.
            Enviaremos solo la respuesta a esta solicitud; no te suscribes a campañas.
          </p>
        </fieldset>
      )}

      <div>
        <label htmlFor="academy" className={LABEL_CLASS}>
          Nombre de tu academia (opcional)
        </label>
        <input
          type="text"
          id="academy"
          name="academy"
          autoComplete="organization"
          className={cn(FIELD_CLASS, "mt-1 block h-11")}
          placeholder="Ej: Club Gimnasia Centro"
        />
      </div>

      <div>
        <label htmlFor="message" className={LABEL_CLASS}>
          Mensaje
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          minLength={10}
          maxLength={selectedReason === "market_access" ? 1_600 : 2_000}
          className={cn(FIELD_CLASS, "mt-1 block py-2.5")}
          placeholder={selectedReason === "market_access"
            ? "Describe la gestión que necesitas, sin nombres ni datos de gimnastas."
            : "Cuéntanos qué necesitas resolver."}
        />
      </div>

      {state.status !== "idle" && (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "success"
              ? "rounded-md border border-chalk-line bg-mat-wash px-4 py-3 text-sm font-medium text-mat-deep"
              : "rounded-md border border-signal/30 bg-signal-wash px-4 py-3 text-sm font-medium text-signal-ink"
          }
        >
          {state.status === "success" && <CheckCircle2 aria-hidden className="mr-2 inline h-4 w-4" />}
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !isHydrated}
        className={cn(buttonVariants({ size: "lg" }), "w-full")}
      >
        {submitting ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
        {!isHydrated ? "Preparando formulario..." : submitting ? "Enviando..." : "Enviar mensaje"}
      </button>

      <p className="text-center text-xs text-ramp-500">
        Al enviar este formulario, aceptas nuestra{" "}
        <Link href="/politica-privacidad" className="underline hover:text-mat">
          política de privacidad
        </Link>
        .
      </p>
    </form>
  );
}

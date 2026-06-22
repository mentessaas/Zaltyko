"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const reasons = [
  { value: "demo", label: "Solicitar demo" },
  { value: "sales", label: "Información de ventas" },
  { value: "support", label: "Soporte técnico" },
  { value: "billing", label: "Facturación" },
  { value: "partnership", label: "Colaboración" },
  { value: "other", label: "Otro" },
];

type SubmitState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

interface ContactFormProps {
  defaultReason?: string;
}

export function ContactForm({ defaultReason = "demo" }: ContactFormProps) {
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setState({ status: "idle" });

    const formData = new FormData(form);
    const reason = String(formData.get("reason") ?? "demo");
    const academy = String(formData.get("academy") ?? "").trim();
    const reasonLabel = reasons.find((item) => item.value === reason)?.label ?? "Contacto";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          subject: academy ? `${reasonLabel} - ${academy}` : reasonLabel,
          message: formData.get("message"),
          honeypot: formData.get("company"),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo enviar el mensaje.");
      }

      form.reset();
      setState({
        status: "success",
        message: "Mensaje enviado. Te responderemos desde el equipo de Zaltyko.",
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-zaltyko-text-main">
          Nombre completo
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
          placeholder="Tu nombre"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zaltyko-text-main">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
          placeholder="tu@email.com"
        />
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-zaltyko-text-main">
          Motivo de contacto
        </label>
        <select
          id="reason"
          name="reason"
          required
          defaultValue={reasons.some((item) => item.value === defaultReason) ? defaultReason : "demo"}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
        >
          {reasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="academy" className="block text-sm font-medium text-zaltyko-text-main">
          Nombre de tu academia (opcional)
        </label>
        <input
          type="text"
          id="academy"
          name="academy"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
          placeholder="Ej: Club Gimnasia Centro"
        />
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-zaltyko-text-main">
          Mensaje
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          minLength={10}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
          placeholder="Cuéntanos qué necesitas resolver."
        />
      </div>

      {state.status !== "idle" && (
        <div
          role="status"
          className={
            state.status === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {state.status === "success" && <CheckCircle2 className="mr-2 inline h-4 w-4" />}
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
        {submitting ? "Enviando..." : "Enviar mensaje"}
      </button>

      <p className="text-center text-xs text-zaltyko-text-secondary">
        Al enviar este formulario, aceptas nuestra{" "}
        <Link href="/privacy-policy" className="underline hover:text-zaltyko-primary">
          política de privacidad
        </Link>
        .
      </p>
    </form>
  );
}

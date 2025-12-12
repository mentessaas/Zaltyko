"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";

interface EventContactProps {
  eventId: string;
  eventTitle: string;
  contactEmail?: string | null;
}

export function EventContact({ eventId, eventTitle, contactEmail }: EventContactProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await fetch(`/api/public/events/${eventId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitStatus("success");
        setFormData({ name: "", email: "", phone: "", message: "" });
      } else {
        setSubmitStatus("error");
      }
    } catch (error) {
      console.error("Error sending contact form:", error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
            Nombre
          </label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="Tu nombre"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            type="email"
            id="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="tu@email.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="phone" className="mb-2 block text-sm font-medium text-foreground">
          Teléfono (opcional)
        </label>
        <input
          type="tel"
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          placeholder="+34 600 000 000"
        />
      </div>

      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium text-foreground">
          Mensaje
        </label>
        <textarea
          id="message"
          required
          rows={4}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          placeholder="Escribe tu mensaje sobre el evento..."
        />
      </div>

      {submitStatus === "success" && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Tu mensaje ha sido enviado. Te contactaremos pronto.
        </div>
      )}

      {submitStatus === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          Hubo un error al enviar el mensaje. Por favor, intenta de nuevo.
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-zaltyko-primary px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-zaltyko-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Enviar mensaje
          </>
        )}
      </button>

      {contactEmail && (
        <p className="text-center text-xs text-muted-foreground">
          O contacta directamente:{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-zaltyko-primary hover:underline"
          >
            {contactEmail}
          </a>
        </p>
      )}
    </form>
  );
}


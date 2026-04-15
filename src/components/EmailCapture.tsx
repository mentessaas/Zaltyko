"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { analytics } from "@/lib/analytics";

interface EmailCaptureProps {
  source?: string;
  plan?: string;
  variant?: "inline" | "standalone";
  placeholder?: string;
  buttonText?: string;
}

export function EmailCapture({
  source = "landing_page",
  plan,
  variant = "inline",
  placeholder = "tu@email.com",
  buttonText = "Comenzar gratis",
}: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, plan }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Error al registrar");
      }

      // Track successful lead capture
      analytics.leadCaptured(email, source);

      setStatus("success");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Error al registrar");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
        <p className="text-sm font-medium">
          ¡Genial! Te hemos registrado. Pronto recibirás novedades.
        </p>
      </div>
    );
  }

  if (variant === "standalone") {
    return (
      <div className="w-full max-w-md mx-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
              required
              disabled={status === "loading"}
              className="flex-1"
            />
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                buttonText
              )}
            </Button>
          </div>
          {status === "error" && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          )}
        </form>
      </div>
    );
  }

  // Inline variant (used within existing sections)
  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-lg mx-auto">
      <div className="relative flex-1">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          required
          disabled={status === "loading"}
          className="pl-10"
        />
      </div>
      <Button type="submit" disabled={status === "loading"}>
        {status === "loading" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          buttonText
        )}
      </Button>
      {status === "error" && (
        <div className="flex items-center gap-2 text-red-600 text-sm sm:absolute sm:-bottom-6">
          <AlertCircle className="w-4 h-4" />
          <span>{errorMessage}</span>
        </div>
      )}
    </form>
  );
}

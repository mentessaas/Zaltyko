"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "loading" | "ready" | "saving" | "saved" | "error";

interface ApiError {
  ok: false;
  error: string;
  message?: string;
}

interface ApiSuccess {
  ok: true;
  data?: Record<string, unknown>;
}

type ApiResponse = ApiSuccess | ApiError;

interface Prefs {
  transactional: boolean;
  marketing: boolean;
}

/**
 * Pagina publica `/preferences` (ZAL-324 Gap 5).
 * Espejo de `/unsubscribe` pero permite ajustar el consentimiento granular
 * (RGPD Art. 6(1)(a) marketing) sin perder los emails operativos.
 */
export default function PreferencesPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ transactional: true, marketing: false });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Falta el token en la URL.");
      return;
    }
    let cancelled = false;
    void fetch(`/api/preferences?token=${encodeURIComponent(token)}`, {
      method: "GET",
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ApiResponse | null;
        if (cancelled) return;
        if (res.ok && body?.ok && body.data) {
          const data = body.data;
          if (typeof data.email === "string") {
            setEmail(data.email);
          }
          const current = data.current as Partial<Prefs> | undefined;
          if (current) {
            setPrefs({
              transactional:
                typeof current.transactional === "boolean"
                  ? current.transactional
                  : true,
              marketing:
                typeof current.marketing === "boolean" ? current.marketing : false,
            });
          }
          setStatus("ready");
        } else {
          setStatus("error");
          setErrorMessage(
            (body && !body.ok && body.message) ||
              "El enlace de preferencias no es valido o ha expirado."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("No se pudo cargar la pagina. Intentalo de nuevo.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSave = async (next: Prefs) => {
    setStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, prefs: next }),
      });
      const body = (await res.json().catch(() => null)) as ApiResponse | null;
      if (res.ok && body?.ok) {
        setPrefs(next);
        setStatus("saved");
      } else {
        setStatus("error");
        setErrorMessage(
          (body && !body.ok && body.message) ||
            "No se pudieron guardar los cambios. Intentalo de nuevo."
        );
      }
    } catch {
      setStatus("error");
      setErrorMessage("Error de red. Intentalo de nuevo.");
    }
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">
            Preferencias de email
          </h1>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">
            Preferencias de email
          </h1>
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">No pudimos cargar tus preferencias.</p>
            {errorMessage && <p className="mt-1">{errorMessage}</p>}
            <p className="mt-2">
              Solicita un nuevo enlace desde el pie del ultimo email.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Preferencias de email
        </h1>
        {email && (
          <p className="mt-2 text-sm text-muted-foreground">
            Para: <span className="font-medium text-foreground">{email}</span>
          </p>
        )}

        <fieldset className="mt-6 space-y-4">
          <legend className="sr-only">Tipos de email</legend>

          <label className="flex items-start gap-3 rounded-md border border-border p-4">
            <input
              type="checkbox"
              checked={prefs.transactional}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, transactional: e.target.checked }))
              }
              className="mt-1 h-4 w-4 rounded border-border"
              aria-describedby="transactional-desc"
            />
            <span>
              <span className="block font-medium text-foreground">
                Emails operativos
              </span>
              <span id="transactional-desc" className="block text-sm text-muted-foreground">
                Avisos de cobros, recordatorios de clase, magic links de acceso.
                Zaltyko los envia como parte del servicio: si los apagas aqui,
                puedes perderte avisos importantes (RGPD Art. 6(1)(b)).
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-border p-4">
            <input
              type="checkbox"
              checked={prefs.marketing}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, marketing: e.target.checked }))
              }
              className="mt-1 h-4 w-4 rounded border-border"
              aria-describedby="marketing-desc"
            />
            <span>
              <span className="block font-medium text-foreground">
                Emails comerciales
              </span>
              <span id="marketing-desc" className="block text-sm text-muted-foreground">
                Novedades del producto, casos de exito, invitaciones a webinars.
                Consentimiento explicito (RGPD Art. 6(1)(a)): si los apagas,
                Zaltyko deja de enviarlos inmediatamente.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="mt-6 flex items-center justify-between gap-2">
          <a
            href={`/unsubscribe?token=${encodeURIComponent(token)}`}
            className="text-sm text-muted-foreground underline"
          >
            Darme de baja de todo
          </a>
          <button
            type="button"
            onClick={() => void onSave(prefs)}
            disabled={status === "saving"}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {status === "saving" ? "Guardando..." : "Guardar preferencias"}
          </button>
        </div>

        {status === "saved" && (
          <p className="mt-4 text-sm text-emerald-700">
            Preferencias guardadas. Gracias.
          </p>
        )}
      </div>
    </main>
  );
}

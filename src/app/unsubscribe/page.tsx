"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "idle" | "loading" | "success" | "error";

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

/**
 * Pagina publica `/unsubscribe` (ZAL-324 Gap 5).
 *
 * Flujo:
 *   1. URL llega con `?token=...` (firmado en `email-link-token.ts`).
 *   2. GET `/api/unsubscribe?token=...` para validar; si invalido, mostrar
 *      mensaje y link a soporte.
 *   3. Usuario confirma el boton "Darme de baja".
 *   4. POST `/api/unsubscribe { token, source: "footer" }`.
 *   5. Mostrar confirmacion final con link a `/preferences` (RGPD: opcion
 *      a reducir frecuencia sin perder todo).
 */
export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Falta el token de baja en la URL.");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "GET",
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ApiResponse | null;
        if (cancelled) return;
        if (res.ok && body?.ok && body.data && typeof body.data.email === "string") {
          setEmail(body.data.email);
          setStatus("idle");
        } else {
          setStatus("error");
          setErrorMessage(
            (body && !body.ok && body.message) ||
              "El enlace de baja no es valido o ha expirado."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("No se pudo validar el enlace. Intentalo de nuevo.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onConfirm = async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, source: "footer" }),
      });
      const body = (await res.json().catch(() => null)) as ApiResponse | null;
      if (res.ok && body?.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(
          (body && !body.ok && body.message) ||
            "No se pudo procesar la baja. Intentalo de nuevo."
        );
      }
    } catch {
      setStatus("error");
      setErrorMessage("Error de red. Intentalo de nuevo.");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Baja de comunicaciones
        </h1>

        {status === "loading" && !email && (
          <p className="mt-4 text-muted-foreground">Validando enlace...</p>
        )}

        {status === "error" && !email && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">No pudimos validar tu enlace.</p>
            {errorMessage && <p className="mt-1">{errorMessage}</p>}
            <p className="mt-2">
              Si tu enlace expiro (30 dias), solicita uno nuevo desde el pie del
              ultimo email o contactanos en{" "}
              <a className="underline" href="/contact">
                nuestra pagina de soporte
              </a>
              .
            </p>
          </div>
        )}

        {email && status !== "success" && (
          <>
            <p className="mt-4 text-muted-foreground">
              Estas a punto de darte de baja de los emails de Zaltyko para{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Recibiras un email de confirmacion. Si solo quieres reducir la
              frecuencia, cambia tus{" "}
              <a className="underline" href={`/preferences?token=${encodeURIComponent(token)}`}>
                preferencias
              </a>{" "}
              en lugar de darte de baja.
            </p>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={status === "loading"}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {status === "loading" ? "Procesando..." : "Confirmar baja"}
            </button>
          </>
        )}

        {status === "success" && (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Listo. Te has dado de baja.</p>
            <p className="mt-1">
              No volveras a recibir emails de Zaltyko salvo los operativos
              directamente relacionados con el servicio (cobros, seguridad,
              magic links). Si fue un error, contactanos en{" "}
              <a className="underline" href="/contact">
                soporte
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

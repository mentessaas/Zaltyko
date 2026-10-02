"use client";
import Link from "next/link";
import { useState } from "react";
import { directoryFetch, inputClass, buttonClass } from "./EntryEditor";
export function DirectoryActions({
  id,
  operational = false,
  claimsEnabled = false,
  event = false,
}: {
  id: string;
  operational?: boolean;
  claimsEnabled?: boolean;
  event?: boolean;
}) {
  const [mode, setMode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function send(body: unknown, path: string) {
    setBusy(true);
    try {
      await directoryFetch(path, body);
      setMessage(
        "Solicitud registrada. Puedes consultar el estado en Mis fichas."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Participa en el directorio</h2>
      <p>
        Consultar y gestionar una ficha es gratis. Verificar un representante no
        certifica la calidad deportiva ni activa una suscripción.
      </p>
      <p>
        <Link
          className="underline"
          href={`/login?next=${encodeURIComponent(`${event ? "/events" : "/academias"}/${id}`)}`}
        >
          Iniciar sesión
        </Link>{" "}
        ·{" "}
        <Link
          className="underline"
          href={`/signup?next=${encodeURIComponent(`${event ? "/events" : "/academias"}/${id}`)}`}
        >
          Crear cuenta
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/directorio/mis-fichas">
          Mis fichas
        </Link>
      </p>
      <div className="flex flex-wrap gap-3">
        {!operational && claimsEnabled && (
          <button className={buttonClass} onClick={() => setMode("claim")}>
            {event ? "Soy el organizador" : "¿Representas a esta academia?"}
          </button>
        )}
        <button
          className={buttonClass}
          onClick={() =>
            send({ entryId: id, save: true }, "/api/directory/favorites")
          }
        >
          Guardar favorito
        </button>
        <button
          className="rounded border p-2"
          onClick={() => setMode("correction")}
        >
          Corregir información
        </button>
        <button
          className="rounded border p-2"
          onClick={() => setMode("removal")}
        >
          Solicitar retirada
        </button>
      </div>
      {operational && (
        <p>
          Esta ficha está vinculada a una academia usuaria. Solicita acceso a su
          administrador mediante los permisos habituales.
        </p>
      )}
      {mode && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (mode === "claim") {
              let evidencePath;
              const file = form.get("file");
              if (file instanceof File && file.size) {
                try {
                  const upload = new FormData();
                  upload.set("file", file);
                  const response = await fetch("/api/directory/evidence", {
                    method: "POST",
                    body: upload,
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.message);
                  evidencePath = result.data.path;
                } catch (err) {
                  setMessage(
                    err instanceof Error
                      ? err.message
                      : "No se pudo revisar el archivo"
                  );
                  return;
                }
              }
              await send(
                {
                  entryId: id,
                  relationship: form.get("relationship"),
                  evidence: form.get("evidence"),
                  evidencePath,
                },
                "/api/directory/claims"
              );
            } else
              await send(
                { kind: mode, entryId: id, message: form.get("message") },
                "/api/directory/proposals"
              );
          }}
        >
          {mode === "claim" ? (
            <>
              <label>
                Tu relación con la entidad
                <input
                  name="relationship"
                  required
                  minLength={5}
                  maxLength={500}
                  className={inputClass}
                />
              </label>
              <label>
                Prueba de representación
                <textarea
                  name="evidence"
                  required
                  minLength={20}
                  maxLength={3000}
                  rows={4}
                  className={inputClass}
                />
              </label>
              <label className="block">
                Documento de representación (opcional, máx. 5 MB)
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                />
              </label>
              <p className="text-sm">
                Describe el correo institucional que controlas o cómo confirmar
                tu representación desde un canal oficial. El administrador
                revisará la prueba. No envíes documentos de identidad ni datos
                de menores.
              </p>
            </>
          ) : (
            <label>
              Información y fuente para revisar
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={2000}
                className={inputClass}
              />
            </label>
          )}
          <button disabled={busy} className={buttonClass}>
            Enviar para revisión
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}

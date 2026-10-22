"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DirectoryEntry } from "@/lib/directory/contracts";
import { entryPath } from "@/lib/directory/contracts";
import { EntryEditor, directoryFetch, buttonClass } from "./EntryEditor";
import { SubscriptionForm } from "./SubscriptionForm";
type Claim = {
  id: string;
  name: string;
  status: string;
  decision: string | null;
};
export function MyListings({
  communicationsEnabled = false,
}: {
  communicationsEnabled?: boolean;
}) {
  const [data, setData] = useState<{
      entries: DirectoryEntry[];
      favorites: DirectoryEntry[];
      claims: Claim[];
      revisions: { id: string; status: string; decision: string | null }[];
    } | null>(null),
    [editing, setEditing] = useState<DirectoryEntry | null>(null),
    [message, setMessage] = useState("");
  async function load() {
    try {
      setData(await directoryFetch("/api/directory/me"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No disponible");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-8">
      <p role="status">{message}</p>
      {!data && (
        <p>
          <Link
            href="/login?next=%2Fdirectorio%2Fmis-fichas"
            className="underline"
          >
            Inicia sesión
          </Link>{" "}
          con una cuenta cuyo correo esté confirmado.
        </p>
      )}
      {data && (
        <>
          <section>
            <h2 className="text-xl font-semibold">Fichas que gestionas</h2>
            {!data.entries.length && (
              <p>
                Aún no tienes permisos de gestión. Solicítalos desde la ficha
                pública.
              </p>
            )}
            {data.entries.map((entry) => (
              <article
                key={entry.id}
                className="my-4 space-y-3 rounded-xl border p-5"
              >
                <Link
                  className="font-semibold underline"
                  href={entryPath(entry)}
                >
                  {entry.data.name}
                </Link>
                <p>
                  {entry.publication === "published"
                    ? "Publicada"
                    : "Sin publicar"}
                </p>
                <button
                  className={buttonClass}
                  onClick={() => setEditing(entry)}
                >
                  Editar ficha
                </button>
                {entry.kind === "academy" && (
                  <p>
                    <Link
                      href={`/onboarding/owner?directoryEntryId=${entry.id}`}
                      className="underline"
                    >
                      Activar la gestión de mi academia
                    </Link>{" "}
                    — requiere un alta expresa y los permisos del SaaS. La ficha
                    sigue siendo gratuita.
                  </p>
                )}
              </article>
            ))}
          </section>
          {editing && (
            <section className="rounded-xl border p-5">
              <h2 className="text-xl font-semibold">
                Editar {editing.data.name}
              </h2>
              <p>
                Descripción, horarios y modalidades se actualizan directamente.
                Los cambios de identidad y contacto se revisan antes de
                publicar.
              </p>
              <EntryEditor
                key={editing.id}
                kind={editing.kind}
                initial={editing.data}
                onSave={async (value) => {
                  const result = await directoryFetch(
                    `/api/directory/entries/${editing.id}`,
                    { data: value },
                    "PATCH"
                  );
                  setMessage(
                    result.pending
                      ? "Cambio enviado para revisión"
                      : "Ficha actualizada"
                  );
                  setEditing(null);
                  await load();
                }}
              />
              <button
                className="mt-4 underline"
                onClick={() => setEditing(null)}
              >
                Cerrar edición
              </button>
            </section>
          )}
          <section>
            <h2 className="text-xl font-semibold">
              Solicitudes de representación
            </h2>
            {data.claims.map((c) => (
              <p key={c.id}>
                {c.name}:{" "}
                {{
                  pending: "Pendiente",
                  approved: "Aprobada",
                  rejected: "Rechazada",
                  disputed: "En disputa",
                  withdrawn: "Retirada",
                }[c.status] ?? c.status}
                {c.decision ? ` · ${c.decision}` : ""}
              </p>
            ))}
          </section>
          <section>
            <h2 className="text-xl font-semibold">Cambios enviados</h2>
            {data.revisions.map((r) => (
              <p key={r.id}>
                {r.status === "pending"
                  ? "Pendiente"
                  : r.status === "approved"
                    ? "Aprobado"
                    : "Rechazado"}
                {r.decision ? ` · ${r.decision}` : ""}
              </p>
            ))}
          </section>
          <section>
            <h2 className="text-xl font-semibold">Favoritos</h2>
            {data.favorites.map((entry) => (
              <p key={entry.id}>
                <Link className="underline" href={entryPath(entry)}>
                  {entry.data.name}
                </Link>{" "}
                <button
                  className="ml-3 underline"
                  onClick={async () => {
                    try {
                      await directoryFetch("/api/directory/favorites", {
                        entryId: entry.id,
                        save: false,
                      });
                      await load();
                    } catch (err) {
                      setMessage(
                        err instanceof Error ? err.message : "No disponible"
                      );
                    }
                  }}
                >
                  Quitar
                </button>
              </p>
            ))}
          </section>
          {communicationsEnabled && (
            <>
              <SubscriptionForm purpose="favorite_changes" />
              <SubscriptionForm purpose="claim_updates" />
            </>
          )}
        </>
      )}
      <Link href="/recursos/kit-academias" className="underline">
        Kit gratuito de organización
      </Link>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import {
  EntryEditor,
  directoryFetch,
  inputClass,
  buttonClass,
} from "./EntryEditor";
import { type DirectoryKind, type EntryData } from "@/lib/directory/contracts";
type Item = {
  id: string;
  kind?: DirectoryKind;
  data?: EntryData;
  name?: string;
  status?: string;
  publication?: string;
  representation?: string;
  reviewed_at?: string;
  source_id?: string;
  summary?: unknown;
  candidate?: unknown;
  error?: string;
  requester_email?: string;
  relationship?: string;
  evidence?: string;
  evidence_path?: string;
  retain_evidence?: boolean;
  decision?: string;
  url?: string;
  authorization?: string;
  last_result?: {
    resources?: { url: string; title: string }[];
    candidates?: number;
  };
  action?: string;
  metadata?: unknown;
  purpose?: string;
};
const stateLabels: Record<string, string> = {
  draft: "Borrador",
  pending: "Pendiente de revisión",
  published: "Publicada",
  withdrawn: "Retirada",
  unclaimed: "Sin reclamar",
  verified: "Representante verificado",
  disputed: "En disputa",
  approved: "Aprobada",
  rejected: "Rechazada",
  accepted: "Aceptado",
  invalid: "Datos por corregir",
  processed: "Procesado",
};
const labels = {
  entries: "Fichas",
  claims: "Reclamaciones y disputas",
  revisions: "Cambios y propuestas",
  sources: "Fuentes",
  batches: "Lotes",
  imports: "Registros importados",
  subscriptions: "Consentimientos",
  audit: "Registro de acciones",
};
export function AdminDirectory() {
  const [section, setSection] = useState<keyof typeof labels>("entries"),
    [page, setPage] = useState(1),
    [items, setItems] = useState<Item[]>([]),
    [next, setNext] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<DirectoryKind>("academy"),
    [edit, setEdit] = useState<Item | null>(null),
    [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null),
    [reason, setReason] = useState("");
  async function load() {
    try {
      const data = await directoryFetch(
        `/api/super-admin/directory?section=${section}&page=${page}`
      );
      setItems(data.items);
      setNext(data.hasNextPage);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No disponible");
    }
  }
  useEffect(() => {
    void load();
  }, [section, page]);
  async function act(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await directoryFetch("/api/super-admin/directory", body);
      setMessage("Acción registrada");
      await load();
      setPending(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <p>
        El directorio no crea cuentas, propietarios ni suscripciones. Publica
        únicamente datos contrastados.
      </p>
      <nav
        className="flex flex-wrap gap-3"
        aria-label="Secciones del directorio"
      >
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            className="rounded border p-2"
            aria-pressed={section === key}
            onClick={() => {
              setSelected([]);
              setSection(key as keyof typeof labels);
              setPage(1);
              setEdit(null);
              setPending(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <p role="status">{message}</p>
      {section === "entries" && (
        <>
          <button
            className={buttonClass}
            onClick={() => {
              setCreate(!create);
              setEdit(null);
            }}
          >
            Crear ficha
          </button>
          {selected.length > 0 && (
            <div className="flex gap-3">
              {["published", "withdrawn"].map((publication) => (
                <button
                  key={publication}
                  className={buttonClass}
                  onClick={async () => {
                    try {
                      const body = {
                        action: "bulk_publication",
                        ids: selected,
                        publication,
                        reason: "Revisión de publicación masiva",
                      };
                      const result = await directoryFetch(
                        "/api/super-admin/directory",
                        body
                      );
                      setPending({ ...body, ...result });
                    } catch (e) {
                      setMessage(
                        e instanceof Error ? e.message : "No disponible"
                      );
                    }
                  }}
                >
                  {publication === "published"
                    ? "Previsualizar publicación de seleccionadas"
                    : "Previsualizar retirada de seleccionadas"}
                </button>
              ))}
            </div>
          )}
          {(create || edit) && (
            <section className="rounded-xl border p-5">
              <h2 className="text-xl font-semibold">
                {edit ? "Editar ficha" : "Nueva ficha"}
              </h2>
              {!edit && (
                <label>
                  Tipo
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as DirectoryKind)}
                    className={inputClass}
                  >
                    <option value="academy">Academia</option>
                    <option value="event">Evento</option>
                    <option value="organization">Organización</option>
                  </select>
                </label>
              )}
              <EntryEditor
                key={edit?.id ?? kind}
                kind={edit?.kind ?? kind}
                initial={edit?.data}
                onSave={async (data) => {
                  await directoryFetch(
                    "/api/super-admin/directory",
                    edit
                      ? { action: "edit", id: edit.id, data }
                      : { action: "create", kind, data }
                  );
                  setEdit(null);
                  setCreate(false);
                  await load();
                }}
              />
            </section>
          )}
        </>
      )}
      {section === "sources" && (
        <form
          className="space-y-3 rounded-xl border p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget);
            await act({
              action: "source",
              name: v.get("name"),
              url: v.get("url"),
              countryCode: String(v.get("countryCode")).toUpperCase(),
              termsUrl: v.get("termsUrl") || null,
              authorization: v.get("authorization") || null,
              enabled: v.get("enabled") === "on",
              adapter: v.get("adapter"),
            });
          }}
        >
          <h2 className="text-xl font-semibold">
            Registrar o actualizar fuente por URL
          </h2>
          {[
            ["name", "Nombre"],
            ["url", "URL HTTPS"],
            ["countryCode", "País ISO"],
            ["termsUrl", "Condiciones de reutilización"],
            ["authorization", "Evidencia o referencia de autorización"],
          ].map(([key, label]) => (
            <label key={key} className="block">
              {label}
              <input
                name={key}
                required={["name", "url", "countryCode"].includes(key)}
                className={inputClass}
              />
            </label>
          ))}
          <label>
            Adaptador
            <select name="adapter" className={inputClass}>
              {["manual", "rfeg", "fdpg", "cbg"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            <input name="enabled" type="checkbox" /> Activar (requiere
            autorización documentada)
          </label>
          <button disabled={busy} className={buttonClass}>
            Guardar fuente
          </button>
        </form>
      )}
      {section === "batches" && (
        <form
          className="space-y-3 rounded-xl border p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget);
            const content = String(v.get("content"));
            setPending({
              action: "import",
              sourceId: v.get("sourceId"),
              format: v.get("format"),
              content,
            });
          }}
        >
          <h2 className="text-xl font-semibold">Preparar carga CSV / JSON</h2>
          <label>
            Identificador de fuente
            <input name="sourceId" required className={inputClass} />
          </label>
          <label>
            Formato
            <select name="format" className={inputClass}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <label>
            Archivo
            <input
              type="file"
              accept=".csv,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2000000) {
                  setMessage("Máximo 2 MB");
                  return;
                }
                const textarea = e.target.form?.elements.namedItem(
                  "content"
                ) as HTMLTextAreaElement;
                if (textarea) textarea.value = await file.text();
              }}
            />
          </label>
          <label>
            Contenido público
            <textarea name="content" rows={7} required className={inputClass} />
          </label>
          <p>
            No incluyas contactos personales, menores ni puntuaciones del CRM.
            Ningún registro se publica al importar.
          </p>
          <button className={buttonClass}>Previsualizar lote</button>
        </form>
      )}
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="space-y-3 rounded-xl border p-5">
            {section === "entries" && (
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(e) =>
                    setSelected((current) =>
                      e.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id)
                    )
                  }
                />
                Seleccionar ficha
              </label>
            )}
            <h3 className="font-semibold">
              {item.data?.name ??
                item.name ??
                item.action ??
                item.purpose ??
                item.id}
            </h3>
            <p className="break-all text-sm">ID: {item.id}</p>
            <p>
              {stateLabels[item.publication ?? item.status ?? ""] ??
                item.publication ??
                item.status}{" "}
              {stateLabels[item.representation ?? ""] ?? item.representation}
            </p>
            {item.reviewed_at &&
              Date.now() - Date.parse(item.reviewed_at) > 90 * 86400000 && (
                <p>Revisión pendiente: han pasado más de 90 días.</p>
              )}
            {item.last_result?.resources?.map((resource) => (
              <p key={resource.url}>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {resource.title || "Calendario PDF para extracción manual"}
                </a>{" "}
                · Requiere revisión de candidatos
              </p>
            ))}
            {item.url && (
              <p>
                <a
                  className="underline"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Fuente oficial
                </a>
              </p>
            )}
            {item.requester_email && (
              <p>Correo verificado del solicitante: {item.requester_email}</p>
            )}
            {item.relationship && <p>Relación: {item.relationship}</p>}
            {item.evidence_path && (
              <button
                className="underline"
                onClick={async () => {
                  try {
                    const data = await directoryFetch(
                      `/api/super-admin/directory/evidence?claimId=${item.id}`
                    );
                    window.open(data.url, "_blank", "noopener,noreferrer");
                  } catch (err) {
                    setMessage(
                      err instanceof Error
                        ? err.message
                        : "Documento no disponible"
                    );
                  }
                }}
              >
                Abrir prueba privada (enlace de 60 segundos)
              </button>
            )}
            {item.evidence && (
              <p className="whitespace-pre-wrap">
                Prueba privada: {item.evidence}
              </p>
            )}
            {item.error && <p role="alert">{item.error}</p>}
            {(item.candidate || item.summary || section === "revisions") && (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(
                  item.candidate ?? item.summary ?? item.data,
                  null,
                  2
                )}
              </pre>
            )}
            <div className="flex flex-wrap gap-3">
              {section === "claims" && (
                <button
                  className="underline"
                  onClick={() =>
                    setPending({
                      action: "retain_evidence",
                      id: item.id,
                      retain: !item.retain_evidence,
                    })
                  }
                >
                  {item.retain_evidence
                    ? "Restablecer eliminación ordinaria de pruebas"
                    : "Conservar pruebas por disputa o necesidad documentada"}
                </button>
              )}
              {section === "sources" && item.authorization && (
                <button
                  className="underline"
                  onClick={() =>
                    setPending({ action: "fetch_source", id: item.id })
                  }
                >
                  Extraer candidatos para revisión
                </button>
              )}
              {section === "entries" && (
                <>
                  {item.kind === "academy" &&
                    item.representation === "verified" && (
                      <button
                        className="underline"
                        onClick={() =>
                          setPending({
                            action: "link_operational",
                            id: item.id,
                            confirm: true,
                          })
                        }
                      >
                        Vincular espacio operativo existente
                      </button>
                    )}
                  <button
                    className="underline"
                    onClick={() => {
                      setEdit(item);
                      setCreate(false);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="underline"
                    onClick={() =>
                      setPending({
                        action: "publish",
                        id: item.id,
                        publication:
                          item.publication === "published"
                            ? "withdrawn"
                            : "published",
                      })
                    }
                  >
                    {item.publication === "published" ? "Retirar" : "Publicar"}
                  </button>
                  {item.representation === "verified" && (
                    <button
                      className="underline"
                      onClick={() =>
                        setPending({ action: "revoke", id: item.id })
                      }
                    >
                      Revocar permiso
                    </button>
                  )}
                  <button
                    className="underline"
                    onClick={async () => {
                      try {
                        const url = `${window.location.origin}/${item.kind === "event" ? "events" : item.kind === "organization" ? "directorio/organizaciones" : "academias"}/${item.id}`;
                        await navigator.clipboard.writeText(
                          `Hola, hemos preparado una ficha informativa de ${item.data?.name ?? "tu entidad"} en Zaltyko, con fuentes públicas. Puedes revisarla y solicitar gestionarla gratis: ${url}. Reclamarla no inicia ninguna suscripción. También puedes descargar el kit gratuito de organización: ${window.location.origin}/recursos/kit-academias. Si algún dato necesita corregirse o prefieres solicitar la retirada, encontrarás esas opciones en la ficha.`
                        );
                        setMessage(
                          "Invitación copiada. Comprueba la autorización del canal antes de enviarla."
                        );
                      } catch {
                        setMessage("No se pudo copiar la invitación");
                      }
                    }}
                  >
                    Copiar invitación a reclamar
                  </button>
                  <button
                    className="underline"
                    onClick={() => setPending({ action: "merge", id: item.id })}
                  >
                    Fusionar duplicado
                  </button>
                </>
              )}
              {["claims", "revisions"].includes(section) &&
                ["pending", "disputed"].includes(item.status ?? "") && (
                  <>
                    <button
                      className="underline"
                      onClick={() =>
                        setPending({
                          action: section === "claims" ? "claim" : "revision",
                          id: item.id,
                          approve: true,
                        })
                      }
                    >
                      Aprobar
                    </button>
                    {section === "claims" && (
                      <button
                        className="underline"
                        onClick={() =>
                          setPending({
                            action: "claim",
                            id: item.id,
                            approve: true,
                            transfer: true,
                          })
                        }
                      >
                        Aprobar transferencia / resolver disputa
                      </button>
                    )}
                    <button
                      className="underline"
                      onClick={() =>
                        setPending({
                          action: section === "claims" ? "claim" : "revision",
                          id: item.id,
                          approve: false,
                        })
                      }
                    >
                      Rechazar
                    </button>
                  </>
                )}
              {section === "imports" &&
                item.status === "pending" &&
                !item.error && (
                  <>
                    <button
                      className="underline"
                      onClick={() =>
                        setPending({ action: "accept_import", id: item.id })
                      }
                    >
                      Crear borrador / proponer cambio
                    </button>
                    <button
                      className="underline"
                      onClick={() =>
                        setPending({
                          action: "accept_import",
                          id: item.id,
                          linkExisting: true,
                        })
                      }
                    >
                      Vincular a una ficha existente
                    </button>
                  </>
                )}
            </div>
          </article>
        ))}
      </div>
      {pending && (
        <section
          role="region"
          aria-label="Confirmar acción"
          className="space-y-3 rounded-xl border-2 border-primary p-5"
        >
          <h2 className="text-xl font-semibold">Revisa antes de confirmar</h2>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(pending, null, 2)}
          </pre>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget);
              await act({
                ...pending,
                ...(pending.action === "link_operational"
                  ? { academyId: v.get("academyId") }
                  : {}),
                ...([
                  "claim",
                  "revision",
                  "revoke",
                  "retain_evidence",
                  "link_operational",
                  "bulk_publication",
                ].includes(String(pending.action))
                  ? { reason }
                  : {}),
                ...(pending.action === "merge" || pending.linkExisting
                  ? { target: v.get("target") }
                  : {}),
              });
            }}
          >
            {[
              "claim",
              "revision",
              "revoke",
              "retain_evidence",
              "link_operational",
              "bulk_publication",
            ].includes(String(pending.action)) && (
              <label className="block">
                Motivo de la decisión
                <input
                  required
                  minLength={pending.action === "retain_evidence" ? 10 : 5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}
            {pending.action === "link_operational" && (
              <label className="block">
                ID del espacio operativo cuyo propietario es el representante
                <input name="academyId" required className={inputClass} />
                <p>
                  La vinculación no modifica propietarios ni roles. El servidor
                  comprobará el propietario actual y el país.
                </p>
              </label>
            )}
            {(pending.action === "merge" || Boolean(pending.linkExisting)) && (
              <label className="block">
                ID de la ficha que se conservará
                <input name="target" required className={inputClass} />
              </label>
            )}
            <button disabled={busy} className={buttonClass}>
              Confirmar acción
            </button>{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setPending(null)}
            >
              Cancelar
            </button>
          </form>
        </section>
      )}
      <nav aria-label="Paginación" className="flex gap-4">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page}</span>
        <button disabled={!next} onClick={() => setPage(page + 1)}>
          Siguiente
        </button>
      </nav>
    </div>
  );
}

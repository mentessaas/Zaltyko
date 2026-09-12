"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";

import type { SuperAdminLogEntry } from "@/lib/super-admin";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

interface SuperAdminLogsTableProps {
  initialLogs: SuperAdminLogEntry[];
  initialTotal: number;
  initialPage: number;
  initialTotalPages: number;
  initialUserId?: string | null;
}

const PAGE_SIZE = 50;

export function SuperAdminLogsTable({
  initialLogs,
  initialTotal,
  initialPage,
  initialTotalPages,
  initialUserId,
}: SuperAdminLogsTableProps) {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(Math.max(1, initialTotalPages));
  const [userId, setUserId] = useState<string | null>(initialUserId ?? null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user?.id) setUserId(data.user.id);
      })
      .catch((error) => {
        logger.warn("Unable to resolve super-admin session for logs", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [supabase]);

  const refresh = async (requestedPage = page) => {
    if (!userId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const safePage = Math.max(1, requestedPage);
      const response = await fetch(
        `/api/super-admin/logs?limit=${PAGE_SIZE}&page=${safePage}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        logger.error("Failed to fetch logs", await response.text());
        setErrorMessage("No se pudieron cargar los logs. Revisa la conexión y reintenta.");
        return;
      }
      const body = await response.json();
      const payload = body.ok ? body.data : body.data ?? body;
      setLogs(payload?.items ?? []);
      setTotal(Number(payload?.total ?? payload?.items?.length ?? 0));
      setPage(Number(payload?.page ?? safePage));
      setTotalPages(Math.max(1, Number(payload?.totalPages ?? 1)));
    } catch (error) {
      logger.error("Failed to refresh logs", error);
      setErrorMessage("No se pudieron cargar los logs. Revisa la conexión y reintenta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/90 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Bitácora</p>
          <h2 className="text-xl font-semibold text-white">Registros de acciones críticas</h2>
          <p className="text-xs text-white/70">
            {total} acciones registradas · Página {page} de {totalPages}
          </p>
        </div>
        <Button
          variant="outline"
          className="border-white/20 bg-white/10 text-slate-100 hover:border-white/40 hover:bg-white/20"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <History className="mr-2 h-4 w-4" strokeWidth={1.8} />
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-zaltyko-coral/30 bg-zaltyko-coral/10 px-4 py-3 text-sm text-zaltyko-coral sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{errorMessage}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zaltyko-coral/40 bg-transparent text-zaltyko-coral hover:bg-zaltyko-coral/10"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Reintentar
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] divide-y divide-white/10 text-sm">
            <thead className="bg-white/10 text-xs uppercase tracking-wide text-white/90">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Acción</th>
                <th className="px-4 py-3 text-left font-semibold">Usuario</th>
                <th className="px-4 py-3 text-left font-semibold">Detalle</th>
                <th className="px-4 py-3 text-right font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-white/70">
                    No hay registros recientes.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">{log.action}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-white">{log.userName ?? "Sin nombre"}</p>
                    <p className="text-xs text-white/70">{log.userEmail ?? "—"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <pre className="max-w-md whitespace-pre-wrap text-xs text-white/70">
                      {JSON.stringify(log.meta ?? {}, null, 2)}
                    </pre>
                  </td>
                  <td className="px-4 py-4 text-right text-xs text-white/70">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString("es-ES")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginación de logs" className="flex items-center justify-between">
          <span className="text-xs text-white/50">
            {PAGE_SIZE} por página
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Ir a la página anterior de logs"
              onClick={() => void refresh(page - 1)}
              disabled={loading || page <= 1}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 text-center text-xs text-white/60">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Ir a la página siguiente de logs"
              onClick={() => void refresh(page + 1)}
              disabled={loading || page >= totalPages}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

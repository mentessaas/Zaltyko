"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const DATA_EXPORT_ENDPOINT = "/api/v1/owner/data-export";
const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type ExportState = {
  organizationId: string;
  status: "idle" | "downloading" | "success" | "error";
  message?: string;
};

type ActiveRequest = {
  id: number;
  organizationId: string;
  controller: AbortController;
};

function safeFilename(organizationId: string) {
  const safeId = organizationId.toLowerCase().replace(/[^a-f0-9-]/g, "");
  return `datos-operativos-${safeId || "academia"}.json`;
}

function messageForStatus(status: number) {
  switch (status) {
    case 401:
      return "Tu sesión ha caducado. Inicia sesión de nuevo y vuelve a intentarlo.";
    case 403:
      return "Tu cuenta no tiene permiso para descargar los datos de esta academia.";
    case 404:
      return "No se encontró una exportación disponible para esta academia.";
    case 413:
      return "El paquete supera el límite permitido para esta descarga.";
    case 429:
      return "Se alcanzó el límite de solicitudes. Espera un momento antes de reintentarlo.";
    case 503:
      return "La descarga está temporalmente no disponible. Inténtalo más tarde.";
    default:
      return "No se pudo descargar el paquete. Inténtalo de nuevo.";
  }
}

export function OwnerAcademyDataExport({
  organizationId,
}: {
  organizationId: string;
}) {
  const requestSequence = useRef(0);
  const activeRequest = useRef<ActiveRequest | null>(null);
  const [state, setState] = useState<ExportState>({
    organizationId,
    status: "idle",
  });
  const currentState =
    state.organizationId === organizationId
      ? state
      : { organizationId, status: "idle" as const };
  const isDownloading = currentState.status === "downloading";

  useCommittedLayoutEffect(() => {
    setState({ organizationId, status: "idle" });

    return () => {
      const request = activeRequest.current;
      if (request?.organizationId !== organizationId) return;

      requestSequence.current += 1;
      activeRequest.current = null;
      request.controller.abort();
    };
  }, [organizationId]);

  async function downloadExport() {
    const previousRequest = activeRequest.current;
    if (previousRequest?.organizationId === organizationId) return;
    if (previousRequest) {
      requestSequence.current += 1;
      activeRequest.current = null;
      previousRequest.controller.abort();
    }

    const requestId = ++requestSequence.current;
    const controller = new AbortController();
    activeRequest.current = { id: requestId, organizationId, controller };
    setState({ organizationId, status: "downloading" });

    const isCurrentRequest = () => {
      const request = activeRequest.current;
      return (
        requestSequence.current === requestId &&
        request !== null &&
        request.id === requestId &&
        request.organizationId === organizationId &&
        !controller.signal.aborted
      );
    };

    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(
        `${DATA_EXPORT_ENDPOINT}?${query.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { accept: "application/json" },
          redirect: "error",
          signal: controller.signal,
        }
      );
      if (!isCurrentRequest()) return;

      if (response.redirected) {
        setState({
          organizationId,
          status: "error",
          message: "No se pudo autorizar la descarga. Inicia sesión y vuelve a intentarlo.",
        });
        return;
      }

      if (!response.ok) {
        setState({
          organizationId,
          status: "error",
          message: messageForStatus(response.status),
        });
        return;
      }

      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/json") {
        setState({
          organizationId,
          status: "error",
          message: "El servidor no devolvió un archivo JSON válido. Inténtalo más tarde.",
        });
        return;
      }

      // Keep the backend package byte-for-byte: its manifest and checksums
      // must not be changed by parsing and serializing the JSON in the client.
      const packageBlob = await response.blob();
      if (!isCurrentRequest()) return;
      if (packageBlob.size === 0) {
        setState({
          organizationId,
          status: "error",
          message: "El servidor devolvió un archivo JSON vacío. Inténtalo más tarde.",
        });
        return;
      }

      const objectUrl = window.URL.createObjectURL(packageBlob);
      const link = document.createElement("a");
      try {
        link.href = objectUrl;
        link.download = safeFilename(organizationId);
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
      }

      if (isCurrentRequest()) {
        setState({
          organizationId,
          status: "success",
          message: "Descarga iniciada.",
        });
      }
    } catch {
      if (!isCurrentRequest()) return;
      setState({
        organizationId,
        status: "error",
        message: "No se pudo conectar con el servicio de exportación. Inténtalo de nuevo.",
      });
    } finally {
      if (activeRequest.current?.id === requestId) {
        activeRequest.current = null;
      }
    }
  }

  return (
    <section
      aria-labelledby="owner-academy-data-export-title"
      className="rounded-[12px] mt-6 border border-z-line bg-white p-5 sm:p-6"
      aria-busy={isDownloading}
    >
      <div className="max-w-3xl">
        <h2
          id="owner-academy-data-export-title"
          className="font-display text-xl font-bold"
        >
          Datos de tu academia
        </h2>
        <p className="mt-2 text-sm leading-6 text-z-soft">
          Descarga los datos operativos disponibles en un archivo JSON. El
          manifiesto incluye el alcance, los checksums y las exclusiones; revísalo
          para conocer los límites del paquete. La descarga no modifica ni
          elimina los datos de la academia.
        </p>
      </div>

      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={() => void downloadExport()}
          disabled={isDownloading}
          className="min-h-11 w-full whitespace-normal px-4 text-center leading-snug sm:w-auto"
        >
          {isDownloading ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {isDownloading ? "Preparando descarga…" : "Descargar datos operativos"}
        </Button>

        {currentState.status === "success" ? (
          <p role="status" className="text-sm text-z-soft">
            {currentState.message}
          </p>
        ) : null}
        {currentState.status === "error" ? (
          <p role="alert" className="text-sm font-medium text-signal-ink">
            {currentState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

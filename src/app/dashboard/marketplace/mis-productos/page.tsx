"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Plus, Pause, Play, Inbox, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { logger } from "@/lib/logger";

interface Listing {
  id: string;
  title: string;
  category: string;
  priceType: string;
  priceCents: number | null;
  currency: string;
  status: string;
  views: number;
  images: string[] | null;
  createdAt: string;
}

// Estado de carga distinguible de error (PV-5): "loading" sigue mostrando
// el spinner, "error" muestra ErrorState con causa y reintento, "ready"
// permite pintar el catálogo o el empty state real.
type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; listings: Listing[] }
  | { kind: "error"; reason: "unauthorized" | "server"; status: number };

const CATEGORY_LABELS: Record<string, string> = {
  equipment: "Equipamiento",
  clothing: "Ropa",
  supplements: "Suplementos",
  books: "Libros",
  particular_training: "Entrenamiento particular",
  personal_training: "Entrenamiento personal",
  clinics: "Clínicas",
  arbitration: "Arbitraje",
  physiotherapy: "Fisioterapia",
  photography: "Fotografía",
  other: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  sold: "Vendido",
};

function formatPrice(cents: number | null, currency: string, priceType: string) {
  if (priceType === "contact") return "A convenir";
  if (cents === null || cents === 0) return "Gratis";
  const eur = (cents / 100).toFixed(2);
  return `${eur} ${currency.toUpperCase()}`;
}

export default function MisProductosPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Listing | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/marketplace/mis-productos");
      if (res.ok) {
        const data = await res.json();
        setState({ kind: "ready", listings: data.listings ?? [] });
      } else if (res.status === 401) {
        // Sesión caducada: NO pintamos "no tienes productos" porque
        // eso oculta el problema real (PV-5). Pedimos reautenticación.
        setState({ kind: "error", reason: "unauthorized", status: 401 });
      } else {
        setState({ kind: "error", reason: "server", status: res.status });
      }
    } catch (err) {
      // Error de red: tampoco podemos afirmar "no tienes productos".
      logger.error("mis-productos fetch", err);
      setState({ kind: "error", reason: "server", status: 0 });
    }
  }

  async function handleStatusToggle(listing: Listing) {
    setToggling(listing.id);
    const newStatus = listing.status === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/marketplace/mis-productos/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Solo actualizamos el estado local si la respuesta fue 2xx
        // (PV-7). Antes el código hacía `setListings` antes del if y
        // mostraba el cambio aunque el servidor hubiera rechazado.
        setState((prev) => {
          if (prev.kind !== "ready") return prev;
          return {
            kind: "ready",
            listings: prev.listings.map((l) =>
              l.id === listing.id ? { ...l, status: newStatus } : l
            ),
          };
        });
        toast.pushToast({
          title: "Actualizado",
          description: `Anuncio ${newStatus === "active" ? "activado" : "pausado"}.`,
          variant: "info",
        });
      } else {
        // 4xx/5xx: feedback explícito (PV-7). Antes no había nada
        // visible y el proveedor creía que había pausado.
        const copy = copyForToggleError(res.status);
        toast.pushToast({
          title: copy.title,
          description: copy.description,
          variant: "error",
        });
      }
    } catch (err) {
      logger.error("mis-productos toggle", err);
      toast.pushToast({
        title: "No se pudo actualizar",
        description: "Revisa tu conexión e inténtalo de nuevo.",
        variant: "error",
      });
    } finally {
      setToggling(null);
    }
  }

  function requestDelete(listing: Listing) {
    // Diálogo del sistema de diseño (PV-7) en lugar de confirm() nativo.
    setConfirmDelete(listing);
  }

  async function performDelete(listing: Listing) {
    setDeleting(listing.id);
    try {
      const res = await fetch(`/api/marketplace/mis-productos/${listing.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setState((prev) => {
          if (prev.kind !== "ready") return prev;
          return {
            kind: "ready",
            listings: prev.listings.filter((l) => l.id !== listing.id),
          };
        });
        toast.pushToast({
          title: "Eliminado",
          description: "Anuncio eliminado.",
          variant: "info",
        });
      } else {
        const copy = copyForDeleteError(res.status);
        toast.pushToast({
          title: copy.title,
          description: copy.description,
          variant: "error",
        });
      }
    } catch (err) {
      logger.error("mis-productos delete", err);
      toast.pushToast({
        title: "No se pudo eliminar",
        description: "Revisa tu conexión e inténtalo de nuevo.",
        variant: "error",
      });
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis productos</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona tus listings en el marketplace de Zaltyko.
          </p>
        </div>
        <Button asChild>
          <Link href="/marketplace/nuevo">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo listing
          </Link>
        </Button>
      </div>

      {state.kind === "loading" ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
        </div>
      ) : state.kind === "error" ? (
        // Error con causa y reintento (PV-5). 401 vs 5xx tienen copy distinto.
        state.reason === "unauthorized" ? (
          <Card>
            <CardContent className="py-10">
              <div className="mx-auto max-w-md text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                  <LogIn className="h-6 w-6 text-amber-600" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">
                    Tu sesión ha caducado
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Vuelve a iniciar sesión para ver tus anuncios.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/login">Iniciar sesión</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <ErrorState
            title="No pudimos cargar tus anuncios"
            message="Hubo un problema al conectar con el servidor. Vuelve a intentarlo en unos segundos."
            onRetry={fetchListings}
          />
        )
      ) : state.listings.length === 0 ? (
        // Empty real (PV-5): ahora distinguible del error. Antes un
        // 401/500 caía aquí y mentía al proveedor.
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Aún no tienes productos publicados</p>
              <p className="text-sm text-muted-foreground">
                Cuando publiques tu primer anuncio aparecerá aquí.
              </p>
            </div>
            <Button asChild>
              <Link href="/marketplace/nuevo">Publica tu primer producto</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {state.listings.map((listing) => (
            <Card key={listing.id} className="relative overflow-hidden">
              {/* Image */}
              {listing.images && listing.images[0] ? (
                <div className="h-40 bg-muted overflow-hidden">
                  <img
                    src={listing.images[0]}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-40 bg-muted flex items-center justify-center text-muted-foreground text-sm">
                  Sin imagen
                </div>
              )}

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight line-clamp-2">
                    {listing.title}
                  </CardTitle>
                  <Badge
                    variant={listing.status === "active" ? "active" : "outline"}
                    className="shrink-0 capitalize"
                  >
                    {STATUS_LABELS[listing.status] ?? listing.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[listing.category] ?? listing.category}
                </p>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">
                    {formatPrice(listing.priceCents, listing.currency, listing.priceType)}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {listing.views} vistas
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={toggling === listing.id}
                    onClick={() => handleStatusToggle(listing)}
                  >
                    {listing.status === "active" ? (
                      <><Pause className="h-3 w-3 mr-1" /> Pausar</>
                    ) : (
                      <><Play className="h-3 w-3 mr-1" /> Activar</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deleting === listing.id}
                    onClick={() => requestDelete(listing)}
                  >
                    <span className="sr-only">Eliminar</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3"
                      aria-hidden
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                    </svg>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmDelete(null);
        }}
        title="¿Eliminar este anuncio?"
        description={`Se eliminará "${confirmDelete?.title ?? ""}" y no podrá recuperarse.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deleting === confirmDelete?.id}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await performDelete(confirmDelete);
        }}
      />
    </div>
  );
}

// Mapea el código HTTP a un mensaje accionable (PV-7). Antes cualquier
// fallo no-red se silenciaba.
function copyForToggleError(status: number): { title: string; description: string } {
  if (status === 401) {
    return {
      title: "Tu sesión ha caducado",
      description: "Inicia sesión de nuevo y vuelve a intentarlo.",
    };
  }
  if (status === 403) {
    return {
      title: "No tienes permiso para modificar este anuncio",
      description: "Si crees que es un error, contáctanos.",
    };
  }
  if (status === 404) {
    return {
      title: "Este anuncio ya no existe",
      description: "Lo hemos quitado de tu lista.",
    };
  }
  return {
    title: "No se pudo actualizar el anuncio",
    description: "Vuelve a intentarlo en unos segundos.",
  };
}

function copyForDeleteError(status: number): { title: string; description: string } {
  if (status === 401) {
    return {
      title: "Tu sesión ha caducado",
      description: "Inicia sesión de nuevo y vuelve a intentarlo.",
    };
  }
  if (status === 403) {
    return {
      title: "No tienes permiso para eliminar este anuncio",
      description: "Si crees que es un error, contáctanos.",
    };
  }
  if (status === 404) {
    return {
      title: "Este anuncio ya no existe",
      description: "Lo hemos quitado de tu lista.",
    };
  }
  return {
    title: "No se pudo eliminar el anuncio",
    description: "Vuelve a intentarlo en unos segundos.",
  };
}


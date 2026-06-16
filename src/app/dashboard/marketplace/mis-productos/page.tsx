"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Edit, Trash2, Plus, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";

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
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    setLoading(true);
    try {
      const res = await fetch("/api/marketplace/mis-productos");
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings ?? []);
      }
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusToggle(listing: Listing) {
    setToggling(listing.id);
    try {
      const newStatus = listing.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/marketplace/mis-productos/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setListings((prev) =>
          prev.map((l) => (l.id === listing.id ? { ...l, status: newStatus } : l))
        );
        toast.pushToast({
          title: "Actualizado",
          description: `Listing ${newStatus === "active" ? "activado" : "pausado"}.`,
          variant: "info",
        });
      }
    } catch {
      toast.pushToast({ title: "Error", description: "No se pudo actualizar.", variant: "error" });
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(listing: Listing) {
    if (!confirm(`¿Eliminar "${listing.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(listing.id);
    try {
      const res = await fetch(`/api/marketplace/mis-productos/${listing.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setListings((prev) => prev.filter((l) => l.id !== listing.id));
        toast.pushToast({ title: "Eliminado", description: "Listing eliminado.", variant: "info" });
      }
    } catch {
      toast.pushToast({ title: "Error", description: "No se pudo eliminar.", variant: "error" });
    } finally {
      setDeleting(null);
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

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">Aún no tienes productos publicados.</p>
            <Button asChild>
              <Link href="/marketplace/nuevo">Publica tu primer producto</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Card key={listing.id} className="relative overflow-hidden">
              {/* Image */}
              {listing.images && listing.images[0] ? (
                <div className="h-40 bg-gray-100 overflow-hidden">
                  <img
                    src={listing.images[0]}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-40 bg-gray-100 flex items-center justify-center text-muted-foreground text-sm">
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
                    onClick={() => handleDelete(listing)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

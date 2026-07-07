"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  MapPin,
  Calendar,
  User,
  CreditCard,
  PauseCircle,
  PlayCircle,
  Save,
  Loader2,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getRegionLabel } from "@/lib/countryRegions";
import { useToast } from "@/components/ui/toast-provider";

const ACADEMY_TYPES = [
  { value: "artistica", label: "Gimnasia artística" },
  { value: "ritmica", label: "Gimnasia rítmica" },
  { value: "general", label: "General" },
] as const;

interface AcademyDetail {
  id: string;
  name: string | null;
  academyType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  ownerId: string | null;
  isSuspended: boolean;
  suspendedAt: string | null;
  createdAt: string | null;
  tenantId: string | null;
  subscription: {
    id: string;
    status: string | null;
    planId: string | null;
    planCode: string | null;
    planNickname: string | null;
    planPrice: number | null;
  } | null;
  owner: {
    id: string;
    name: string | null;
    userId: string;
  } | null;
}

interface SuperAdminAcademyDetailProps {
  initialAcademy: AcademyDetail;
  userId: string;
}

interface Plan {
  id: string;
  code: string;
  nickname: string | null;
  priceEur: number | null;
}

export function SuperAdminAcademyDetail({ initialAcademy, userId }: SuperAdminAcademyDetailProps) {
  const router = useRouter();
  const toast = useToast();
  const [academy, setAcademy] = useState<AcademyDetail>(initialAcademy);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [formData, setFormData] = useState({
    name: academy.name ?? "",
    isSuspended: academy.isSuspended,
    planId: academy.subscription?.planId ?? "",
    academyType: academy.academyType ?? "artistica",
    country: academy.country ?? "",
    region: academy.region ?? "",
    city: academy.city ?? "",
  });

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/plans", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans || []);
        } else {
          console.error("Failed to fetch plans:", response.status);
        }
      } catch (error) {
        console.error("Error fetching plans", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/super-admin/academies/${academy.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim() || null,
          isSuspended: formData.isSuspended,
          planId: formData.planId || null,
          academyType: formData.academyType || null,
          country: formData.country.trim() || null,
          region: formData.region.trim() || null,
          city: formData.city.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        toast.pushToast({
          title: "No se pudieron guardar los cambios",
          description: error || "Inténtalo de nuevo en unos segundos.",
          variant: "error",
        });
        return;
      }

      const updated = await response.json();
      
      const refreshResponse = await fetch(`/api/super-admin/academies/${academy.id}`, {
        headers: {
        },
        cache: "no-store",
      });
      
      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        setAcademy(refreshed);
        setFormData({
          name: refreshed.name ?? "",
          isSuspended: refreshed.isSuspended,
          planId: refreshed.subscription?.planId ?? "",
          academyType: refreshed.academyType ?? "artistica",
          country: refreshed.country ?? "",
          region: refreshed.region ?? "",
          city: refreshed.city ?? "",
        });
      } else {
        setAcademy({ ...academy, ...updated });
      }
      
      toast.pushToast({
        title: "Cambios guardados",
        description: "La academia se actualizó correctamente.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      console.error("Error saving academy", error);
      toast.pushToast({
        title: "No se pudieron guardar los cambios",
        description: "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspension = async () => {
    if (!confirm(formData.isSuspended ? "¿Reactivar la academia?" : "¿Suspender la academia?")) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/super-admin/academies/${academy.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isSuspended: !formData.isSuspended,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        toast.pushToast({
          title: "No se pudo cambiar el estado de la academia",
          description: error || "Inténtalo de nuevo en unos segundos.",
          variant: "error",
        });
        return;
      }

      const updated = await response.json();
      setAcademy({ ...academy, ...updated });
      setFormData({ ...formData, isSuspended: updated.isSuspended });
      router.refresh();
    } catch (error) {
      console.error("Error toggling suspension", error);
      toast.pushToast({
        title: "No se pudo cambiar el estado de la academia",
        description: "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">{academy.name ?? "Sin nombre"}</h1>
            <p className="mt-2 text-sm text-white/70">
              ID: <span className="font-mono text-xs">{academy.id}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="border-zaltyko-primary/40 bg-zaltyko-primary/10 text-zaltyko-primary-light hover:border-zaltyko-primary-light hover:bg-zaltyko-primary-light/20"
              onClick={() => router.push(`/app/${academy.id}/dashboard`)}
              disabled={academy.isSuspended}
            >
              <ExternalLink className="mr-2 h-4 w-4" strokeWidth={1.8} />
              Ver academia
            </Button>
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                academy.isSuspended
                  ? "bg-zaltyko-coral/15 text-zaltyko-coral"
                  : "bg-zaltyko-primary/15 text-zaltyko-primary-light",
              )}
            >
              {academy.isSuspended ? "Suspendida" : "Activa"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
              onClick={handleToggleSuspension}
              disabled={saving}
            >
              {academy.isSuspended ? (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" strokeWidth={1.8} />
                  Reactivar
                </>
              ) : (
                <>
                  <PauseCircle className="mr-2 h-4 w-4" strokeWidth={1.8} />
                  Suspender
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <Building2 className="h-4 w-4" strokeWidth={1.8} />
                Información básica
              </Label>
              <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="text-xs text-white/50">Nombre</p>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                    placeholder="Nombre de la academia"
                  />
                </div>
                <div>
                  <p className="text-xs text-white/50">Tipo</p>
                  <select
                    value={formData.academyType}
                    onChange={(e) => setFormData({ ...formData, academyType: e.target.value })}
                    className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:border-white/40 focus:border-white/60 focus:outline-none"
                  >
                    {ACADEMY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-white/50">País</p>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="mt-1 border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                      placeholder="España"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-white/50">{getRegionLabel(formData.country) || "Provincia/Región"}</p>
                    <Input
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="mt-1 border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-white/50">Ciudad</p>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="mt-1 border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                  />
                </div>
                <p className="flex items-center gap-2 text-xs text-white/40">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Ubicación usada en el listado de academias
                </p>
              </div>
            </div>

            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <User className="h-4 w-4" strokeWidth={1.8} />
                Propietario
              </Label>
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-white">
                  {academy.owner?.name ?? "Sin propietario asignado"}
                </p>
                {academy.owner && (
                  <p className="mt-1 text-xs text-white/50">
                    ID: <span className="font-mono">{academy.owner.id}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <CreditCard className="h-4 w-4" strokeWidth={1.8} />
                Suscripción y Plan
              </Label>
              <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="mb-2 text-xs text-white/50">Plan</p>
                  {loading ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/50">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando planes...
                    </div>
                  ) : (
                    <select
                      value={formData.planId}
                      onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:border-white/40 focus:border-white/60 focus:outline-none"
                    >
                      <option value="">Sin plan</option>
                      {plans.length === 0 ? (
                        <option disabled>No hay planes disponibles</option>
                      ) : (
                        plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.code.toUpperCase()} - {plan.nickname ?? plan.code}
                            {plan.priceEur !== null && ` (€${(plan.priceEur / 100).toFixed(2)}/mes)`}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                  {academy.subscription && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-white/50">Estado de suscripción</p>
                      <p className="text-sm font-medium capitalize text-white">
                        {academy.subscription.status ?? "Sin estado"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <Calendar className="h-4 w-4" strokeWidth={1.8} />
                Fechas
              </Label>
              <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                <div>
                  <p className="text-xs text-white/50">Creada</p>
                  <p className="mt-1 text-white">
                    {academy.createdAt
                      ? new Date(academy.createdAt).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
                {academy.suspendedAt && (
                  <div>
                    <p className="text-xs text-white/50">Suspendida desde</p>
                    <p className="mt-1 text-white">
                      {new Date(academy.suspendedAt).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-6">
          <Button
            variant="outline"
            className="border-white/20 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
            onClick={() => router.back()}
          >
            Cancelar
          </Button>
          <Button
            className="bg-zaltyko-primary text-white hover:bg-primary-dark"
            onClick={handleSave}
            disabled={
              saving ||
              (formData.name === academy.name &&
                formData.isSuspended === academy.isSuspended &&
                formData.planId === (academy.subscription?.planId ?? "") &&
                formData.academyType === (academy.academyType ?? "artistica") &&
                formData.country === (academy.country ?? "") &&
                formData.region === (academy.region ?? "") &&
                formData.city === (academy.city ?? ""))
            }
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" strokeWidth={1.8} />
                Guardar cambios
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

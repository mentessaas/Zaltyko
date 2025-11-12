"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Shield,
  Calendar,
  Building2,
  PauseCircle,
  PlayCircle,
  Save,
  Loader2,
  ExternalLink,
  CreditCard,
  Send,
  Users,
  GraduationCap,
  BookOpen,
  LogIn,
  MessageSquare,
  Bell,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface UserMembership {
  id: string;
  academyId: string | null;
  role: string | null;
  academyName: string | null;
  academyType: string | null;
}

interface UserSubscription {
  id: string;
  planId: string | null;
  planCode: string | null;
  planNickname: string | null;
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface UserDetail {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
  tenantId: string | null;
  activeAcademyId: string | null;
  isSuspended: boolean;
  canLogin: boolean;
  createdAt: string | null;
  memberships: UserMembership[];
  subscription: UserSubscription | null;
  stats?: {
    academiesOwned: number;
    totalAthletes: number;
    totalCoaches: number;
    totalClasses: number;
  };
}

interface Plan {
  id: string;
  code: string;
  nickname: string | null;
  priceEur: number | null;
}

interface SuperAdminUserDetailProps {
  initialUser: UserDetail;
  userId: string;
}

function formatRole(role: string | null) {
  if (!role) return "Sin rol";
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "coach":
      return "Coach";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Tutor";
    case "super_admin":
      return "Super Admin";
    default:
      return role;
  }
}

function formatAcademyType(value: string | null) {
  switch (value) {
    case "artistica":
      return "Gimnasia artística";
    case "ritmica":
      return "Gimnasia rítmica";
    case "trampolin":
      return "Trampolín";
    case "general":
      return "General / Mixta";
    default:
      return value ?? "Sin tipo";
  }
}

const ROLE_OPTIONS = ["owner", "admin", "coach", "athlete", "parent", "super_admin"] as const;

export function SuperAdminUserDetail({ initialUser, userId }: SuperAdminUserDetailProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserDetail>(initialUser);
  const [saving, setSaving] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [activatingAccess, setActivatingAccess] = useState(false);
  const [planViolations, setPlanViolations] = useState<{
    violations: Array<{
      resource: string;
      currentCount: number;
      limit: number | null;
      items: Array<{ id: string; name: string | null }>;
    }>;
    requiresAction: boolean;
  } | null>(null);
  const [messageForm, setMessageForm] = useState({
    subject: "",
    message: "",
    type: "email" as "email" | "notification",
  });
  const [formData, setFormData] = useState({
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "",
    isSuspended: user.isSuspended,
    planId: user.subscription?.planId ?? "",
  });

  useEffect(() => {
    const fetchPlans = async () => {
      setLoadingPlans(true);
      try {
        const response = await fetch("/api/plans", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans || []);
        }
      } catch (error) {
        console.error("Error fetching plans", error);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSendEmail = () => {
    if (!user.email) {
      alert("El usuario no tiene correo electrónico registrado");
      return;
    }
    window.location.href = `mailto:${user.email}?subject=Contacto desde Zaltyko`;
  };

  const handleActivateAthleteAccess = async () => {
    if (!confirm("¿Estás seguro de activar el acceso de este atleta? Se enviará un correo de invitación.")) {
      return;
    }

    setActivatingAccess(true);
    try {
      const response = await fetch("/api/super-admin/athletes/activate-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          profileId: user.id,
          email: user.email || undefined,
          sendInvitation: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.message || data.error || "Error desconocido"}`);
        return;
      }

      alert(data.message || "Acceso activado correctamente");
      
      // Refresh user data
      const refreshResponse = await fetch(`/api/super-admin/users/${user.id}`, {
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });

      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        setUser(refreshed);
      }

      router.refresh();
    } catch (error) {
      console.error("Error activating athlete access", error);
      alert("Error al activar el acceso del atleta");
    } finally {
      setActivatingAccess(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageForm.subject.trim() || !messageForm.message.trim()) {
      alert("Por favor completa el asunto y el mensaje");
      return;
    }

    setSendingMessage(true);
    try {
      const response = await fetch(`/api/super-admin/users/${user.id}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          profileId: user.id,
          subject: messageForm.subject.trim(),
          message: messageForm.message.trim(),
          type: messageForm.type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error al enviar: ${error.message || error.error || "Error desconocido"}`);
        return;
      }

      const result = await response.json();
      alert(result.message || "Mensaje enviado correctamente");
      setMessageForm({ subject: "", message: "", type: "email" });
    } catch (error) {
      console.error("Error sending message", error);
      alert("Error al enviar el mensaje");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/super-admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          name: formData.name.trim() || null,
          email: formData.email.trim() || null,
          role: formData.role || null,
          isSuspended: formData.isSuspended,
          planId: formData.planId || null,
        }),
      });

      if (!response.ok) {
        let errorData: { error?: string; violations?: unknown; requiresAction?: boolean };
        try {
          errorData = await response.json();
        } catch {
          const errorText = await response.text();
          errorData = { error: errorText };
        }
        
        // Handle plan limit violations
        if (errorData.error === "PLAN_LIMIT_VIOLATIONS" && errorData.violations) {
          setPlanViolations({
            violations: errorData.violations as Array<{
              resource: string;
              currentCount: number;
              limit: number | null;
              items: Array<{ id: string; name: string | null }>;
            }>,
            requiresAction: errorData.requiresAction ?? true,
          });
          return;
        }
        
        alert(`Error al guardar: ${errorData.error || "Error desconocido"}`);
        return;
      }

      const refreshResponse = await fetch(`/api/super-admin/users/${user.id}`, {
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });

      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        setUser(refreshed);
        setFormData({
          name: refreshed.name ?? "",
          email: refreshed.email ?? "",
          role: refreshed.role ?? "",
          isSuspended: refreshed.isSuspended,
          planId: refreshed.subscription?.planId ?? "",
        });
      }

      alert("Cambios guardados correctamente");
      router.refresh();
    } catch (error) {
      console.error("Error saving user", error);
      alert("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleForcePlanChange = async () => {
    if (!confirm("¿Estás seguro de cambiar el plan aunque exceda los límites? El usuario deberá ajustar manualmente sus academias.")) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/super-admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          planId: formData.planId || null,
          force: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        alert(`Error: ${error}`);
        return;
      }

      const refreshResponse = await fetch(`/api/super-admin/users/${user.id}`, {
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });

      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        setUser(refreshed);
        setFormData({
          ...formData,
          planId: refreshed.subscription?.planId ?? "",
        });
        setPlanViolations(null);
      }

      alert("Plan cambiado. Se ha notificado al usuario sobre los ajustes necesarios.");
      router.refresh();
    } catch (error) {
      console.error("Error forcing plan change", error);
      alert("Error al cambiar el plan");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspension = async () => {
    if (!confirm(formData.isSuspended ? "¿Reactivar al usuario?" : "¿Suspender al usuario?")) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/super-admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          isSuspended: !formData.isSuspended,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        alert(`Error: ${error}`);
        return;
      }

      const refreshResponse = await fetch(`/api/super-admin/users/${user.id}`, {
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });

      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        setUser(refreshed);
        setFormData({ ...formData, isSuspended: refreshed.isSuspended });
        router.refresh();
      }
    } catch (error) {
      console.error("Error toggling suspension", error);
      alert("Error al cambiar el estado");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    formData.name !== (user.name ?? "") ||
    formData.email !== (user.email ?? "") ||
    formData.role !== (user.role ?? "") ||
    formData.isSuspended !== user.isSuspended ||
    formData.planId !== (user.subscription?.planId ?? "");

  return (
    <div className="space-y-6">
      {/* Modal de violaciones de límites */}
      {planViolations && planViolations.requiresAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-2xl rounded-2xl border border-amber-400/60 bg-slate-900 p-6 shadow-xl">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-white">Atención: Límites del plan excedidos</h2>
              <p className="mt-2 text-sm text-slate-300">
                El nuevo plan tiene límites más restrictivos. El usuario tiene los siguientes recursos que exceden el límite:
              </p>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {planViolations.violations.map((violation, idx) => (
                <div key={idx} className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-white capitalize">
                      {violation.resource === "academies" && "Academias"}
                      {violation.resource === "athletes" && "Atletas"}
                      {violation.resource === "classes" && "Clases"}
                      {violation.resource === "groups" && "Grupos"}
                    </h3>
                    <span className="text-sm text-amber-300">
                      {violation.currentCount} / {violation.limit ?? "∞"}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-slate-400">
                    Tienes {violation.currentCount} {violation.resource}, pero el plan solo permite {violation.limit ?? "ilimitados"}.
                  </p>
                  {violation.items.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      <p className="mb-1 text-xs font-semibold text-slate-300">Items afectados:</p>
                      <ul className="space-y-1 text-xs text-slate-400">
                        {violation.items.slice(0, 5).map((item) => (
                          <li key={item.id}>• {item.name ?? `ID: ${item.id}`}</li>
                        ))}
                        {violation.items.length > 5 && (
                          <li className="text-slate-500">... y {violation.items.length - 5} más</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3 border-t border-white/10 pt-4">
              <Button
                variant="outline"
                className="flex-1 border-white/20 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
                onClick={() => {
                  setPlanViolations(null);
                  // Revert plan change
                  setFormData({ ...formData, planId: user.subscription?.planId ?? "" });
                }}
              >
                Cancelar cambio de plan
              </Button>
              <Button
                className="flex-1 bg-amber-500 text-white hover:bg-amber-600"
                onClick={handleForcePlanChange}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cambiando...
                  </>
                ) : (
                  "Cambiar plan de todas formas"
                )}
              </Button>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Nota: Si cambias el plan de todas formas, se notificará al usuario para que ajuste manualmente sus recursos.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">{user.name ?? "Sin nombre"}</h1>
            <p className="mt-2 text-sm text-slate-300">
              ID: <span className="font-mono text-xs">{user.id}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user.email && (
              <Button
                variant="outline"
                size="sm"
                className="border-blue-500/60 bg-blue-500/20 text-blue-100 font-semibold shadow-sm hover:border-blue-400 hover:bg-blue-500/30 hover:text-white"
                onClick={handleSendEmail}
              >
                <Send className="mr-2 h-4 w-4" strokeWidth={1.8} />
                Enviar correo
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-purple-500/60 bg-purple-500/20 text-purple-100 font-semibold shadow-sm hover:border-purple-400 hover:bg-purple-500/30 hover:text-white"
              onClick={() => router.push(`/dashboard/profile/${user.id}`)}
            >
              <LogIn className="mr-2 h-4 w-4" strokeWidth={1.8} />
              Ver como usuario
            </Button>
            {user.role === "athlete" && !user.canLogin && (
              <Button
                variant="outline"
                size="sm"
                className="border-green-500/60 bg-green-500/20 text-green-100 font-semibold shadow-sm hover:border-green-400 hover:bg-green-500/30 hover:text-white"
                onClick={handleActivateAthleteAccess}
                disabled={activatingAccess || saving}
              >
                {activatingAccess ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activando...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" strokeWidth={1.8} />
                    Activar acceso
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-500/60 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm hover:border-emerald-400 hover:bg-emerald-500/30 hover:text-white"
              onClick={handleToggleSuspension}
              disabled={saving || user.role === "super_admin"}
            >
              {user.isSuspended ? (
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
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                user.isSuspended
                  ? "bg-rose-500/15 text-rose-300"
                  : "bg-emerald-500/15 text-emerald-300",
              )}
            >
              {user.isSuspended ? "Suspendido" : "Activo"}
            </span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <User className="h-4 w-4" strokeWidth={1.8} />
                Información personal
              </Label>
              <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="mb-2 text-xs text-slate-400">Nombre</p>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                    placeholder="Nombre del usuario"
                    disabled={user.role === "super_admin"}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs text-slate-400">Correo electrónico</p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                      placeholder="correo@ejemplo.com"
                      disabled={user.role === "super_admin"}
                    />
                    {formData.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-500/40 bg-blue-500/10 text-blue-200 hover:border-blue-400 hover:bg-blue-400/20"
                        onClick={handleSendEmail}
                      >
                        <Mail className="h-4 w-4" strokeWidth={1.8} />
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-slate-400">Rol</p>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:border-white/40 focus:border-white/60 focus:outline-none"
                    disabled={user.role === "super_admin" || saving}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {formatRole(role)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <CreditCard className="h-4 w-4" strokeWidth={1.8} />
                Plan y Suscripción
              </Label>
              <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="mb-2 text-xs text-slate-400">Plan</p>
                  {loadingPlans ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando planes...
                    </div>
                  ) : (
                    <select
                      value={formData.planId}
                      onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:border-white/40 focus:border-white/60 focus:outline-none"
                      disabled={saving}
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
                  {user.subscription && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-xs text-slate-400">Estado de suscripción</p>
                        <p className="text-sm font-medium capitalize text-white">
                          {user.subscription.status ?? "Sin estado"}
                        </p>
                      </div>
                      {user.subscription.stripeCustomerId && (
                        <div>
                          <p className="text-xs text-slate-400">Stripe Customer ID</p>
                          <p className="mt-1 font-mono text-xs text-white">
                            {user.subscription.stripeCustomerId}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <Calendar className="h-4 w-4" strokeWidth={1.8} />
                Información de cuenta
              </Label>
              <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Usuario ID</p>
                  <p className="mt-1 font-mono text-xs text-white">{user.userId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Perfil ID</p>
                  <p className="mt-1 font-mono text-xs text-white">{user.id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tenant ID</p>
                  <p className="mt-1 font-mono text-xs text-white">{user.tenantId ?? "Sin tenant"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Academia activa</p>
                  <p className="mt-1 font-mono text-xs text-white">
                    {user.activeAcademyId ?? "Sin academia activa"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Registrado</p>
                  <p className="mt-1 text-white">
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <MessageSquare className="h-4 w-4" strokeWidth={1.8} />
                Enviar mensaje o notificación
              </Label>
              <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="mb-2 text-xs text-slate-400">Tipo de mensaje</p>
                  <select
                    value={messageForm.type}
                    onChange={(e) =>
                      setMessageForm({ ...messageForm, type: e.target.value as "email" | "notification" })
                    }
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:border-white/40 focus:border-white/60 focus:outline-none"
                    disabled={sendingMessage || !user.email}
                  >
                    <option value="email">Correo electrónico</option>
                    <option value="notification">Notificación (próximamente)</option>
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-xs text-slate-400">Asunto</p>
                  <Input
                    value={messageForm.subject}
                    onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                    className="border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                    placeholder="Asunto del mensaje"
                    disabled={sendingMessage || !user.email}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs text-slate-400">Mensaje</p>
                  <textarea
                    value={messageForm.message}
                    onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
                    className="min-h-[120px] w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-white/60 focus:outline-none"
                    placeholder="Escribe tu mensaje aquí..."
                    disabled={sendingMessage || !user.email}
                  />
                </div>
                {!user.email && (
                  <p className="text-xs text-amber-400">
                    Este usuario no tiene correo electrónico registrado. No se pueden enviar mensajes.
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full border-blue-500/60 bg-blue-500/20 text-blue-100 font-semibold shadow-sm hover:border-blue-400 hover:bg-blue-500/30 hover:text-white"
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !user.email || !messageForm.subject.trim() || !messageForm.message.trim()}
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" strokeWidth={1.8} />
                      Enviar {messageForm.type === "email" ? "correo" : "notificación"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {user.stats && (
              <div>
                <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                  <Shield className="h-4 w-4" strokeWidth={1.8} />
                  Estadísticas
                </Label>
                <div className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-emerald-400" strokeWidth={1.8} />
                      <div>
                        <p className="text-xs text-slate-400">Academias</p>
                        <p className="text-lg font-semibold text-white">{user.stats.academiesOwned}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-400" strokeWidth={1.8} />
                      <div>
                        <p className="text-xs text-slate-400">Atletas</p>
                        <p className="text-lg font-semibold text-white">{user.stats.totalAthletes}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-purple-400" strokeWidth={1.8} />
                      <div>
                        <p className="text-xs text-slate-400">Entrenadores</p>
                        <p className="text-lg font-semibold text-white">{user.stats.totalCoaches}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-orange-400" strokeWidth={1.8} />
                      <div>
                        <p className="text-xs text-slate-400">Clases</p>
                        <p className="text-lg font-semibold text-white">{user.stats.totalClasses}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <Building2 className="h-4 w-4" strokeWidth={1.8} />
                Membresías de academias ({user.memberships.length})
              </Label>
              <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
                {user.memberships.length === 0 ? (
                  <p className="text-sm text-slate-400">No tiene membresías activas</p>
                ) : (
                  user.memberships.map((membership) => (
                    <div
                      key={membership.id}
                      className="rounded-lg border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-white">{membership.academyName ?? "Sin nombre"}</p>
                          <p className="mt-1 text-xs text-slate-300">
                            {formatAcademyType(membership.academyType)} · Rol: {formatRole(membership.role)}
                          </p>
                        </div>
                        {membership.academyId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-3 border-white/20 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
                            onClick={() => router.push(`/super-admin/academies/${membership.academyId}`)}
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
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
            className="bg-emerald-500 text-white hover:bg-emerald-600"
            onClick={handleSave}
            disabled={saving || !hasChanges || user.role === "super_admin"}
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


"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2,
  Users,
  BarChart3,
  Calendar,
  CreditCard,
  Palette,
  ArrowRight,
  ArrowLeft,
  Building2,
  UserPlus,
  SkipForward,
  Sparkles,
} from "lucide-react";

type StepKey = "academy" | "athletes" | "payments-team" | "brand" | "activation";

const STEPS: { key: StepKey; label: string; skippable: boolean }[] = [
  { key: "academy", label: "Perfil + Clases", skippable: true },
  { key: "athletes", label: "Atletas", skippable: false },
  { key: "payments-team", label: "Pagos + Equipo", skippable: true },
  { key: "brand", label: "Marca", skippable: true },
  { key: "activation", label: "Activacion", skippable: false },
];

const STEP_ORDER: StepKey[] = ["academy", "athletes", "payments-team", "brand", "activation"];

function getStepIndex(step: StepKey): number {
  return STEP_ORDER.indexOf(step);
}

function getNextStep(current: StepKey): StepKey | null {
  const idx = getStepIndex(current);
  return idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : null;
}

function getPrevStep(current: StepKey): StepKey | null {
  const idx = getStepIndex(current);
  return idx > 0 ? STEP_ORDER[idx - 1] : null;
}

export default function CoachOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState<StepKey>("academy");
  const [completedSteps, setCompletedSteps] = useState<Set<StepKey>>(new Set());
  const [loading, setLoading] = useState(false);
  const [ academies, setAcademies] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loadingAcademies, setLoadingAcademies] = useState(true);

  // Academy + Classes form state
  const [academy, setAcademy] = useState({
    name: "",
    type: "",
    country: "",
    city: "",
  });
  const [groupName, setGroupName] = useState("");
  const [groupDiscipline, setGroupDiscipline] = useState("");
  const [groupLevel, setGroupLevel] = useState("");
  const [groupSchedule, setGroupSchedule] = useState({
    weekday: "",
    startTime: "",
    endTime: "",
  });

  // Athletes form state
  const [athletes, setAthletes] = useState<{ name: string; email: string }[]>([
    { name: "", email: "" },
  ]);

  // Payments + Team form state
  const [stripeConnected, setStripeConnected] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ name: string; email: string; role: string }[]>([
    { name: "", email: "", role: "coach" },
  ]);

  // Brand form state
  const [brand, setBrand] = useState({
    primaryColor: "#DC2626",
    logoUrl: "",
  });

  useEffect(() => {
    fetchAcademies();
  }, []);

  async function fetchAcademies() {
    setLoadingAcademies(true);
    try {
      const res = await fetch("/api/onboarding/user-academies");
      if (res.ok) {
        const data = await res.json();
        setAcademies(data.academies ?? []);
      }
    } catch {
      setAcademies([]);
    } finally {
      setLoadingAcademies(false);
    }
  }

  function markStepComplete(step: StepKey) {
    setCompletedSteps((prev) => new Set([...prev, step]));
  }

  function goToStep(step: StepKey) {
    const next = getNextStep(currentStep);
    if (next && !completedSteps.has(currentStep)) {
      markStepComplete(currentStep);
    }
    setCurrentStep(step);
  }

  function handleNext() {
    const next = getNextStep(currentStep);
    if (next) {
      markStepComplete(currentStep);
      setCurrentStep(next);
    }
  }

  function handleBack() {
    const prev = getPrevStep(currentStep);
    if (prev) {
      setCurrentStep(prev);
    }
  }

  function handleSkip() {
    markStepComplete(currentStep);
    const next = getNextStep(currentStep);
    if (next) {
      setCurrentStep(next);
    }
  }

  async function handleFinish() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      // First, ensure profile exists with owner role
      await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: academy.name || "Owner",
          role: "owner",
        }),
      });

      // Create academy if provided
      if (academy.name && academy.type) {
        const academyRes = await fetch("/api/academies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: academy.name,
            type: academy.type,
            country: academy.country || "ES",
            city: academy.city || "",
          }),
        });

        if (!academyRes.ok) {
          const err = await academyRes.json();
          throw new Error(err.message || "Error al crear academia");
        }
      }

      markStepComplete("activation");
      setCurrentStep("activation");

      setTimeout(() => {
        if (academies.length > 0 || academy.name) {
          router.push("/dashboard");
        } else {
          router.push("/dashboard");
        }
      }, 2000);
    } catch (err) {
      toast.pushToast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo completar.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAthletes() {
    const validAthletes = athletes.filter((a) => a.name.trim());
    if (validAthletes.length === 0) return true;

    try {
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athletes: validAthletes }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleInviteTeam() {
    const validMembers = teamMembers.filter((m) => m.email.trim());
    if (validMembers.length === 0) return true;

    try {
      await Promise.all(
        validMembers.map((member) =>
          fetch("/api/team/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(member),
          }).catch(() => {})
        )
      );
      return true;
    } catch {
      return true;
    }
  }

  async function handleAcademySubmit() {
    if (!academy.name.trim()) {
      toast.pushToast({
        title: "Campo requerido",
        description: "El nombre de la academia es obligatorio",
        variant: "error",
      });
      return false;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const res = await fetch("/api/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({
          name: academy.name,
          type: academy.type || "gymnastics",
          country: academy.country || "ES",
          city: academy.city || "",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al crear academia");
      }

      return true;
    } catch (err) {
      toast.pushToast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo crear la academia",
        variant: "error",
      });
      return false;
    }
  }

  const progressValue = ((getStepIndex(currentStep) + 1) / STEPS.length) * 100;
  const currentStepConfig = STEPS.find((s) => s.key === currentStep)!;
  const isFirstStep = getStepIndex(currentStep) === 0;
  const isLastStep = getStepIndex(currentStep) === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-lg">
              Z
            </div>
            <span className="font-display font-bold text-2xl text-gray-900">Zaltyko</span>
          </Link>
        </div>

        {/* Progress Indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Paso {getStepIndex(currentStep) + 1} de {STEPS.length}
            </span>
            <span className="text-sm text-muted-foreground">{currentStepConfig.label}</span>
          </div>
          <Progress value={progressValue} className="h-2" />
          {/* Step dots */}
          <div className="flex justify-between mt-2">
            {STEPS.map((step) => {
              const idx = getStepIndex(step.key);
              const isCompleted = completedSteps.has(step.key);
              const isCurrent = step.key === currentStep;
              return (
                <div
                  key={step.key}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isCompleted
                      ? "bg-green-500"
                      : isCurrent
                      ? "bg-red-500"
                      : "bg-gray-300"
                  }`}
                  title={step.label}
                />
              );
            })}
          </div>
        </div>

        {/* Step 1: Academy Profile + Classes */}
        {currentStep === "academy" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
                  <Building2 className="h-7 w-7 text-red-600" />
                </div>
                <h2 className="text-xl font-bold">Perfil de tu Academia</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Configura los datos basicos y crea tu primer grupo de entrenamiento
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Nombre de la academia *</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                    placeholder="Gimnasia Valtyko"
                    value={academy.name}
                    onChange={(e) => setAcademy((a) => ({ ...a, name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Tipo de academia</label>
                  <select
                    className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                    value={academy.type}
                    onChange={(e) => setAcademy((a) => ({ ...a, type: e.target.value }))}
                  >
                    <option value="">Selecciona...</option>
                    <option value="gymnastics">Gimnasia</option>
                    <option value="dance">Danza</option>
                    <option value="martial_arts">Artes Marciales</option>
                    <option value="fitness">Fitness</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium block mb-1">Pais</label>
                    <select
                      className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                      value={academy.country}
                      onChange={(e) => setAcademy((a) => ({ ...a, country: e.target.value }))}
                    >
                      <option value="ES">Espana</option>
                      <option value="MX">Mexico</option>
                      <option value="AR">Argentina</option>
                      <option value="CO">Colombia</option>
                      <option value="CL">Chile</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Ciudad</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                      placeholder="Madrid"
                      value={academy.city}
                      onChange={(e) => setAcademy((a) => ({ ...a, city: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-sm mb-3">Primer grupo de entrenamiento</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium block mb-1">Nombre del grupo</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                      placeholder="Pre-Competicion"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium block mb-1">Disciplina</label>
                      <select
                        className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        value={groupDiscipline}
                        onChange={(e) => setGroupDiscipline(e.target.value)}
                      >
                        <option value="">Selecciona...</option>
                        <option value="artistica_femenina">Gimnasia Artistica Femenina</option>
                        <option value="artistica_masculina">Gimnasia Artistica Masculina</option>
                        <option value="ritmica">Gimnasia Ritmica</option>
                        <option value="trampolin">Trampolin</option>
                        <option value="parkour">Parkour</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Nivel</label>
                      <select
                        className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        value={groupLevel}
                        onChange={(e) => setGroupLevel(e.target.value)}
                      >
                        <option value="">Selecciona...</option>
                        <option value="principiante">Principiante</option>
                        <option value="intermedio">Intermedio</option>
                        <option value="avanzado">Avanzado</option>
                        <option value="competicion">Competicion</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Horario</label>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        className="rounded-xl border border-zaltyko-border bg-white/50 px-3 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        value={groupSchedule.weekday}
                        onChange={(e) => setGroupSchedule((s) => ({ ...s, weekday: e.target.value }))}
                      >
                        <option value="">Dia</option>
                        <option value="1">Lunes</option>
                        <option value="2">Martes</option>
                        <option value="3">Miercoles</option>
                        <option value="4">Jueves</option>
                        <option value="5">Viernes</option>
                        <option value="6">Sabado</option>
                        <option value="0">Domingo</option>
                      </select>
                      <input
                        type="time"
                        className="rounded-xl border border-zaltyko-border bg-white/50 px-3 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        value={groupSchedule.startTime}
                        onChange={(e) => setGroupSchedule((s) => ({ ...s, startTime: e.target.value }))}
                      />
                      <input
                        type="time"
                        className="rounded-xl border border-zaltyko-border bg-white/50 px-3 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        value={groupSchedule.endTime}
                        onChange={(e) => setGroupSchedule((s) => ({ ...s, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleSkip} className="flex-1">
                  <SkipForward className="h-4 w-4 mr-2" />
                  Saltar por ahora
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  Siguiente
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Athletes */}
        {currentStep === "athletes" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                  <Users className="h-7 w-7 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold">Agregar Atletas</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Anade tus gimnastas uno a uno o importa desde CSV
                </p>
              </div>

              <div className="space-y-3">
                {athletes.map((athlete, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        placeholder="Nombre completo"
                        value={athlete.name}
                        onChange={(e) => {
                          const updated = [...athletes];
                          updated[idx].name = e.target.value;
                          setAthletes(updated);
                        }}
                      />
                      <input
                        type="email"
                        className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                        placeholder="email@ejemplo.com (opcional)"
                        value={athlete.email}
                        onChange={(e) => {
                          const updated = [...athletes];
                          updated[idx].email = e.target.value;
                          setAthletes(updated);
                        }}
                      />
                    </div>
                    {athletes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setAthletes((prev) => prev.filter((_, i) => i !== idx))}
                        className="h-11 px-3 text-gray-400 hover:text-red-500"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => setAthletes((prev) => [...prev, { name: "", email: "" }])}
                className="w-full"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Anadir otro atleta
              </Button>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Atras
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  Siguiente
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Payments + Team */}
        {currentStep === "payments-team" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <CreditCard className="h-7 w-7 text-green-600" />
                </div>
                <h2 className="text-xl font-bold">Pagos + Equipo</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Configura Stripe para cobros y invita a tu equipo
                </p>
              </div>

              {/* Stripe Connection */}
              <div className="border rounded-xl p-4">
                <h3 className="font-medium text-sm mb-2">Configuracion de pagos</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Conecta tu cuenta de Stripe para procesar pagos de mensualidades
                </p>
                <button
                  type="button"
                  onClick={() => setStripeConnected(!stripeConnected)}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    stripeConnected
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:opacity-90"
                  }`}
                >
                  {stripeConnected ? "Conectado con Stripe" : "Conectar con Stripe"}
                </button>
              </div>

              {/* Team Members */}
              <div className="border rounded-xl p-4">
                <h3 className="font-medium text-sm mb-2">Invitar equipo</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Anade entrenadores o管理人员 para ayudarte a gestionar la academia
                </p>
                <div className="space-y-2">
                  {teamMembers.map((member, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                          placeholder="Nombre"
                          value={member.name}
                          onChange={(e) => {
                            const updated = [...teamMembers];
                            updated[idx].name = e.target.value;
                            setTeamMembers(updated);
                          }}
                        />
                        <input
                          type="email"
                          className="w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                          placeholder="email@ejemplo.com"
                          value={member.email}
                          onChange={(e) => {
                            const updated = [...teamMembers];
                            updated[idx].email = e.target.value;
                            setTeamMembers(updated);
                          }}
                        />
                      </div>
                      {teamMembers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setTeamMembers((prev) => prev.filter((_, i) => i !== idx))}
                          className="h-11 px-3 text-gray-400 hover:text-red-500"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setTeamMembers((prev) => [...prev, { name: "", email: "", role: "coach" }])}
                  className="mt-2 text-sm text-zaltyko-primary hover:underline"
                >
                  + Anadir otro miembro
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleSkip} className="flex-1">
                  <SkipForward className="h-4 w-4 mr-2" />
                  Saltar por ahora
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  Siguiente
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Brand */}
        {currentStep === "brand" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                  <Palette className="h-7 w-7 text-purple-600" />
                </div>
                <h2 className="text-xl font-bold">Personalizar Marca</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Haz que tu academia destaque con tu propia marca
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Color principal</label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      className="w-12 h-12 rounded-xl border-2 border-zaltyko-border cursor-pointer"
                      value={brand.primaryColor}
                      onChange={(e) => setBrand((b) => ({ ...b, primaryColor: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="flex-1 rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2.5 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light"
                      value={brand.primaryColor}
                      onChange={(e) => setBrand((b) => ({ ...b, primaryColor: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Logo de la academia</label>
                  <div className="border-2 border-dashed border-zaltyko-border rounded-xl p-6 text-center hover:border-zaltyko-primary/50 transition-colors cursor-pointer">
                    <div className="text-muted-foreground text-sm">
                      Arrastra una imagen aqui o
                      <button type="button" className="text-zaltyko-primary hover:underline ml-1">
                        busca en tu equipo
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG hasta 2MB</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleSkip} className="flex-1">
                  <SkipForward className="h-4 w-4 mr-2" />
                  Saltar por ahora
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  Siguiente
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Activation */}
        {currentStep === "activation" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center mb-3">
                  <Sparkles className="h-7 w-7 text-red-600" />
                </div>
                <h2 className="text-xl font-bold">Tu academia esta lista</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Revision final antes de activar tu cuenta
                </p>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h3 className="font-medium text-sm">Resumen de configuracion</h3>

                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{academy.name || "Academia sin nombre"}</p>
                    <p className="text-xs text-muted-foreground">
                      {academy.type || "Tipo no especificado"}
                      {academy.city ? ` - ${academy.city}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">
                      {athletes.filter((a) => a.name.trim()).length} atletas
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {athletes.filter((a) => a.name.trim()).length > 0
                        ? "Listos para registrar"
                        : "Podras anadir mas adelante"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CreditCard className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">
                      {stripeConnected ? "Stripe conectado" : "Pagos pendientes"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stripeConnected
                        ? "Listo para cobrar"
                        : "Configura mas adelante desde ajustes"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Palette className="h-4 w-4 text-purple-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Marca personalizada</p>
                    <p className="text-xs text-muted-foreground">
                      Color: {brand.primaryColor}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Atras
                </Button>
                <Button onClick={handleFinish} disabled={loading} className="flex-1">
                  {loading ? (
                    "Activando..."
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Activar Academia
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Skip hint */}
        {currentStepConfig.skippable && currentStep !== "activation" && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            Los pasos opcionales se pueden completar mas tarde desde ajustes
          </p>
        )}
      </div>
    </div>
  );
}

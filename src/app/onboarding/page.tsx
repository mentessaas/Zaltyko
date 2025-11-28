"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useDevSession } from "@/components/dev-session-provider";
import { Progress } from "@/components/ui/progress";
import { FormField, validators } from "@/components/ui/form-field";
import { COUNTRY_REGION_OPTIONS } from "@/lib/countryRegions";
import { ACADEMY_TYPES, onboardingCopy } from "@/lib/onboardingCopy";
import { createClient } from "@/lib/supabase/client";
import { isDevFeaturesEnabled } from "@/lib/dev";
import { trackEvent } from "@/lib/analytics";
import { useToast } from "@/components/ui/toast-provider";
import { getErrorMessage } from "@/lib/errors";
import { StepCompletionCelebration } from "@/components/onboarding/StepCompletionCelebration";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Clock, HelpCircle, Upload, CheckCircle2, AlertCircle, ArrowRight, Lock, TrendingUp, Users, Sparkles } from "lucide-react";

interface CoachInput {
  name: string;
  email: string;
}

interface AthleteInput {
  name: string;
}

type StepKey = 1 | 2;

const STEP_FLOW: Array<{ id: StepKey; label: string }> = [
  { id: 1, label: "Cuenta" },
  { id: 2, label: "Academia" },
];

const DISCIPLINE_OPTIONS = [
  { value: "artistica_femenina", label: "Gimnasia artística femenina" },
  { value: "artistica_masculina", label: "Gimnasia artística masculina" },
  { value: "ritmica", label: "Gimnasia rítmica" },
] as const;

export default function OnboardingWizard() {
  const router = useRouter();
  const { session, loading: loadingSession, update, refresh } = useDevSession();
  const supabase = createClient();
  const toast = useToast();
  const [step, setStep] = useState<StepKey>(1);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [academyType, setAcademyType] = useState<(typeof ACADEMY_TYPES)[number]["value"]>(
    ACADEMY_TYPES[0].value
  );
  const [coaches, setCoaches] = useState<CoachInput[]>([{ name: "", email: "" }]);
  const [athletes, setAthletes] = useState<AthleteInput[]>([
    { name: "" },
    { name: "" },
    { name: "" },
    { name: "" },
    { name: "" },
  ]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>(["artistica_femenina"]);
  const [structureGroups, setStructureGroups] = useState<string[]>([
    "Inicial 6-8 años",
    "Juvenil 9-12 años",
    "Competición",
  ]);
  const [groupName, setGroupName] = useState("");
  const [groupDiscipline, setGroupDiscipline] = useState<(typeof ACADEMY_TYPES)[number]["value"]>(
    ACADEMY_TYPES[0].value
  );
  const [groupLevel, setGroupLevel] = useState("Iniciación");
  const [groupWeekday, setGroupWeekday] = useState("1");
  const [groupStartTime, setGroupStartTime] = useState("17:00");
  const [groupEndTime, setGroupEndTime] = useState("18:30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [maxStep, setMaxStep] = useState<StepKey>(1);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastCompletedStep, setLastCompletedStep] = useState<{ number: number; name: string } | null>(null);
  const [userPlan, setUserPlan] = useState<"free" | "pro" | "premium">("free");
  const [userHasAcademies, setUserHasAcademies] = useState(false);
  const [existingAcademies, setExistingAcademies] = useState<Array<{ id: string; name: string | null }>>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [userPlanInfo, setUserPlanInfo] = useState<{
    planCode: "free" | "pro" | "premium";
    academyLimit: number | null;
    currentAcademyCount: number;
    canCreateMore: boolean;
    upgradeTo?: "pro" | "premium";
  } | null>(null);
  const STORAGE_KEY = "gymna_onboarding_state";

  // Tiempo estimado por paso (en minutos)
  const STEP_TIME_ESTIMATES: Record<StepKey, number> = {
    1: 2,
    2: 1.5,
  };

  // Cargar estado persistido (si existe) antes de bootstrap de sesión
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Partial<{
          step: StepKey;
          academyId: string | null;
          tenantId: string | null;
          academyType: (typeof ACADEMY_TYPES)[number]["value"];
          selectedCountry: string;
          selectedRegion: string;
          selectedCity: string;
          fullName: string;
          email: string;
        }>;
        if (parsed.step) setStep(parsed.step);
        if (parsed.academyId) setAcademyId(parsed.academyId);
        if (parsed.tenantId) setTenantId(parsed.tenantId);
        if (parsed.academyType) setAcademyType(parsed.academyType);
        if (parsed.selectedCountry) setSelectedCountry(parsed.selectedCountry);
        if (parsed.selectedRegion) setSelectedRegion(parsed.selectedRegion);
        if (parsed.selectedCity) setSelectedCity(parsed.selectedCity);
        if (parsed.fullName) setFullName(parsed.fullName);
        if (parsed.email) setEmail(parsed.email);
      }
    } catch {
      // ignore
    }
  }, []);

  const ensureProfile = useCallback(
    async (userId: string, fallbackName?: string | null) => {
      try {
        const getResponse = await fetch("/api/onboarding/profile", {
          method: "GET",
          headers: {
            "x-user-id": userId,
          },
        });

        if (getResponse.ok) {
          const data = await getResponse.json();
          setProfileId(data.profileId);
          update({
            userId,
            profileId: data.profileId,
            tenantId: data.tenantId ?? session?.tenantId ?? "",
          });
          return data;
        }

        if (getResponse.status !== 404) {
          const data = await getResponse.json().catch(() => ({}));
          throw new Error(data?.error ?? "No se pudo obtener el perfil.");
        }
      } catch (err) {
        console.error(err);
      }

      const bodyPayload = fallbackName ? { name: fallbackName } : {};
      const postResponse = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(bodyPayload),
      });
      const postData = await postResponse.json();
      if (!postResponse.ok) {
        throw new Error(postData?.error ?? "No se pudo crear el perfil.");
      }
      setProfileId(postData.profileId);
      update({
        userId,
        profileId: postData.profileId,
        tenantId: postData.tenantId ?? session?.tenantId ?? "",
      });
      return postData;
    },
    [session?.tenantId, update]
  );

  // Persistir estado mínimo del wizard
  useEffect(() => {
    if (typeof window === "undefined") return;
    const data = {
      step,
      academyId,
      tenantId,
      academyType,
      selectedCountry,
      selectedRegion,
      selectedCity,
      fullName,
      email,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [
    step,
    academyId,
    tenantId,
    academyType,
    selectedCountry,
    selectedRegion,
    fullName,
    email,
  ]);

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setAuthUserId(user.id);
        setEmail(user.email ?? "");
        try {
          await ensureProfile(
            user.id,
            (user.user_metadata as Record<string, unknown>)?.full_name as string | undefined ??
            user.email ??
            null
          );
        } catch (err: unknown) {
          setError(getErrorMessage(err));
        }
        setMaxStep((prev) => (prev < 2 ? 2 : prev));
        setStep((prev) => (prev === 1 ? 2 : prev));
      }
    };
    bootstrap();
  }, [ensureProfile, supabase]);

  useEffect(() => {
    if (session?.userId) {
      setAuthUserId((prev) => prev ?? session.userId);
      setProfileId((prev) => prev ?? session.profileId ?? null);
      setStep((prev) => (prev === 1 ? 2 : prev));
      setMaxStep((prev) => (prev < 2 ? 2 : prev));
    }
    if (!academyId && session?.academyId) {
      setAcademyId(session.academyId);
    }
    if (!tenantId && session?.tenantId) {
      setTenantId(session.tenantId);
    }
  }, [academyId, session?.academyId, session?.profileId, session?.tenantId, session?.userId, tenantId]);

  useEffect(() => {
    if (!academyId) return;
    const fetchServerState = async () => {
      try {
        const res = await fetch(`/api/onboarding/state?academyId=${academyId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const serverStep = Number(data?.state?.currentStep ?? 0) as StepKey;
        // Solo considerar pasos 1 y 2 (los únicos que existen ahora)
        if (serverStep && serverStep > 0 && serverStep <= 2) {
          setMaxStep((prev) => (prev < serverStep ? serverStep : prev));
          setStep((prev) => (prev < serverStep ? serverStep : prev));
        }
      } catch {
        // ignore
      }
    };
    fetchServerState();
  }, [academyId]);

  const effectiveUserId = authUserId ?? session?.userId ?? null;

  // Verificar si el usuario ya tiene academias y su plan
  useEffect(() => {
    const checkUserAcademiesAndPlan = async () => {
      if (!effectiveUserId || step !== 2) return;
      try {
        const res = await fetch("/api/onboarding/user-academies", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setUserHasAcademies(data.hasAcademies || false);
          setExistingAcademies(data.academies || []);

          // Obtener información del plan del usuario
          const planRes = await fetch("/api/onboarding/user-plan", { cache: "no-store" });
          if (planRes.ok) {
            const planData = await planRes.json();
            setUserPlanInfo({
              planCode: planData.planCode || "free",
              academyLimit: planData.academyLimit ?? 1,
              currentAcademyCount: planData.currentAcademyCount || 0,
              canCreateMore: planData.canCreateMore !== false,
              upgradeTo: planData.upgradeTo,
            });
          }

          // Si tiene academias y no hay academyId, usar la primera
          if (data.hasAcademies && data.academies?.length > 0 && !academyId) {
            const firstAcademy = data.academies[0];
            setAcademyId(firstAcademy.id);
            setMaxStep((prev) => (prev < 2 ? 2 : prev));
          }
        }
      } catch (error) {
        console.error("Error checking user academies:", error);
      }
    };
    checkUserAcademiesAndPlan();
  }, [effectiveUserId, step, academyId]);

  const copy = onboardingCopy[academyType] ?? onboardingCopy.artistica;
  const safeStep = (step <= 2 ? step : 2) as 1 | 2;
  const stepCopy = copy.steps[safeStep];
  const { heading, description, sectionTitle, sectionDescription, recommendations } = stepCopy;

  const totalSteps = STEP_FLOW.length;
  const currentIndex = STEP_FLOW.findIndex((item) => item.id === step);
  const progressValue = useMemo(() => {
    if (currentIndex < 0) return 0;
    return ((currentIndex + 1) / totalSteps) * 100;
  }, [currentIndex, totalSteps]);

  const getStepOrder = (id: StepKey) => {
    const idx = STEP_FLOW.findIndex((item) => item.id === id);
    return idx >= 0 ? idx + 1 : null;
  };

  const handleStepChange = (target: StepKey) => {
    if (target <= maxStep) {
      setStep(target);
    }
  };

  const handleGoBack = () => {
    setStep((prev) => {
      if (prev <= 1) return prev;
      const nextValue = (prev - 1) as StepKey;
      return nextValue;
    });
  };


  const canGoNext = useMemo(() => {
    if (step === 1) {
      return (
        email.length > 0 &&
        password.length >= 6 &&
        password === confirmPassword
      );
    }
    if (step === 2) return Boolean(academyId);
    return true;
  }, [
    academyId,
    confirmPassword,
    email.length,
    password,
    step,
  ]);

  const handleAccountRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.pushToast({
        title: "Error de validación",
        description: "Las contraseñas no coinciden.",
        variant: "error",
      });
      return;
    }
    if (password.length < 6) {
      toast.pushToast({
        title: "Error de validación",
        description: "La contraseña debe tener al menos 6 caracteres.",
        variant: "error",
      });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      const userId = data.user?.id;
      if (!userId) {
        throw new Error("No se pudo obtener el usuario creado.");
      }
      // En algunos proyectos, signUp no devuelve sesión hasta confirmar correo.
      // Para el flujo de onboarding, intentamos iniciar sesión inmediatamente.
      if (!data.session) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) {
          // No bloquear el flujo si el login inmediato falla, pero informar claramente.
          // El layout de /app requiere cookie de Supabase para no redirigir a /auth/login.
          throw new Error(
            "Tu cuenta fue creada, pero no pudimos iniciar sesión automáticamente. Inicia sesión con tu correo y contraseña para continuar."
          );
        }
      }
      setAuthUserId(userId);
      await trackEvent("signup_completed", { userId });

      await ensureProfile(userId, fullName);
      setMaxStep((prev) => (prev < 2 ? 2 : prev));
      setStep(2);

      toast.pushToast({
        title: "Cuenta creada",
        description: "Tu cuenta ha sido creada exitosamente.",
        variant: "success",
      });
    } catch (err: unknown) {
      let errorMessage = getErrorMessage(err);

      // Mejorar mensajes de error específicos de Supabase
      if (err && typeof err === 'object' && 'message' in err) {
        const supabaseError = err as { message: string; status?: number };
        if (supabaseError.status === 500 || supabaseError.message.includes('500') || supabaseError.message.includes('Database error')) {
          errorMessage = "Error al crear la cuenta. Por favor, verifica que el correo no esté ya registrado o intenta más tarde. Si el problema persiste, contacta con soporte.";
        } else if (supabaseError.message.includes('already registered') || supabaseError.message.includes('User already exists')) {
          errorMessage = "Este correo electrónico ya está registrado. Por favor, inicia sesión o usa otro correo.";
        } else if (supabaseError.message.includes('email')) {
          errorMessage = "El correo electrónico no es válido o ya está en uso.";
        } else if (supabaseError.message.includes('password')) {
          errorMessage = "La contraseña no cumple con los requisitos de seguridad.";
        }
      }

      setError(errorMessage);
      toast.pushToast({
        title: "Error al registrar",
        description: errorMessage,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAcademy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Verificar límite de plan antes de intentar crear
    if (userPlanInfo && !userPlanInfo.canCreateMore) {
      setError(`⚠️ Has alcanzado el límite de academias de tu plan ${userPlanInfo.planCode.toUpperCase()}. Actualiza tu plan para crear más academias.`);
      toast.pushToast({
        title: "Límite alcanzado",
        description: `Tu plan permite ${userPlanInfo.academyLimit === null ? "ilimitadas" : userPlanInfo.academyLimit} academias. Actualiza tu plan para crear más.`,
        variant: "error",
      });
      return;
    }

    // Validación clara de campos requeridos
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const name = form.get("name") as string;
    const country = selectedCountry || (form.get("country") as string);
    const city = selectedCity || (form.get("city") as string) || "";

    const errors: Record<string, string> = {};

    if (!effectiveUserId) {
      setError("❌ Debes crear una cuenta antes de registrar tu academia. Por favor, completa el paso 1 primero.");
      return;
    }

    if (!name || name.trim().length < 2) {
      errors.name = "El nombre de la academia es obligatorio y debe tener al menos 2 caracteres";
    }

    if (!country) {
      errors.country = "Debes seleccionar un país";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const errorMessages = Object.values(errors).join(". ");
      setError(`⚠️ Por favor completa todos los campos requeridos:\n\n${errorMessages}`);
      toast.pushToast({
        title: "Campos incompletos",
        description: errorMessages,
        variant: "error",
      });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/academies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": effectiveUserId,
        },
        body: JSON.stringify({
          name: name.trim(),
          country,
          region: null, // Región eliminada del onboarding
          city: city.trim() || null, // Ciudad opcional, texto libre
          academyType,
          ownerProfileId: profileId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error as string | undefined;
        if (code === "PROFILE_REQUIRED") {
          throw new Error("❌ Tu perfil aún no está listo. Por favor, refresca la sesión e inténtalo de nuevo. Si el problema persiste, vuelve al paso 1.");
        }
        if (code === "OWNER_PROFILE_NOT_FOUND") {
          throw new Error("❌ No se encontró tu perfil de propietario. Por favor, vuelve al paso 1 y completa tu información de cuenta.");
        }
        if (code === "ACADEMY_LIMIT_REACHED" || code === "LIMIT_REACHED") {
          const upgradeInfo = data?.payload?.upgradeInfo;
          const currentCount = data?.payload?.currentCount ?? 0;
          const limit = data?.payload?.limit ?? 1;
          let message = `⚠️ Has alcanzado el límite de academias de tu plan actual.\n\n`;
          message += `📊 Estado actual: ${currentCount} de ${limit} academias permitidas.\n\n`;
          message += `💡 Solución: `;
          if (upgradeInfo) {
            message += `Actualiza a ${upgradeInfo.plan.toUpperCase()} (${upgradeInfo.price}) para crear academias ilimitadas.`;
          } else if (data?.payload?.upgradeTo) {
            message += `Actualiza a ${data.payload.upgradeTo.toUpperCase()} para crear más academias.`;
          } else {
            message += `Actualiza tu plan desde la sección de facturación para crear más academias.`;
          }
          const error = new Error(message) as Error & { upgradeInfo?: typeof upgradeInfo; upgradeTo?: string };
          error.upgradeInfo = upgradeInfo;
          error.upgradeTo = data?.payload?.upgradeTo;
          throw error;
        }
        // Errores de validación del servidor
        if (data?.message && typeof data.message === "string") {
          throw new Error(`❌ ${data.message}`);
        }
        throw new Error(`❌ Error al crear la academia: ${data?.error ?? "Error desconocido"}`);
      }
      setAcademyId(data.id);
      setTenantId(data.tenantId);
      update({
        academyId: data.id,
        tenantId: data.tenantId ?? session?.tenantId ?? tenantId ?? "",
        userId: effectiveUserId,
        profileId: profileId ?? session?.profileId ?? undefined,
      });

      // Marcar el paso "academy" como completado en el estado del onboarding
      try {
        await fetch("/api/onboarding/state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(effectiveUserId ? { "x-user-id": effectiveUserId } : {}),
          },
          body: JSON.stringify({
            academyId: data.id,
            step: "academy",
          }),
        });
      } catch (error) {
        console.error("Error marking onboarding step:", error);
      }

      // Enviar email de bienvenida
      if (effectiveUserId && data.id) {
        try {
          await fetch("/api/onboarding/welcome-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              academyId: data.id,
              userId: effectiveUserId,
            }),
          });
        } catch (error) {
          console.error("Error sending welcome email:", error);
        }
      }

      // Redirigir al dashboard inmediatamente
      toast.pushToast({
        title: "¡Academia creada!",
        description: "Redirigiendo a tu dashboard...",
        variant: "success",
      });
      router.push(`/app/${data.id}/dashboard`);
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);

      // Si hay información de upgrade, mostrar botón
      if (err && typeof err === 'object' && 'upgradeInfo' in err) {
        const upgradeErr = err as { upgradeInfo?: { plan: string; price: string; benefits: string[] }; upgradeTo?: string };
        if (upgradeErr.upgradeInfo) {
          // El mensaje ya incluye la información de upgrade
          // Podríamos agregar un botón aquí si fuera necesario
        }
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen w-full bg-zaltyko-bg flex">
      {/* Left Panel: Form Wizard */}
      <div className="flex-1 flex flex-col min-h-screen relative z-10 bg-white/50 backdrop-blur-sm">
        {/* Header Mobile */}
        <div className="lg:hidden p-4 flex items-center justify-between border-b border-zaltyko-border bg-white">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white font-bold">Z</div>
            <span className="font-display font-bold text-zaltyko-text-main">Zaltyko</span>
          </div>
          <Link href="/" className="text-sm text-zaltyko-text-secondary hover:text-zaltyko-primary">
            Salir
          </Link>
        </div>

        <div className="flex-1 flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24">
          <div className="mx-auto w-full max-w-lg">
            {/* Header Desktop */}
            <div className="hidden lg:flex items-center justify-between mb-12">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white font-bold">Z</div>
                <span className="font-display font-bold text-zaltyko-text-main">Zaltyko</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between text-sm font-medium text-zaltyko-text-secondary mb-2">
                <span>Paso {step} de {totalSteps}</span>
                <span>{Math.round(progressValue)}%</span>
              </div>
              <Progress value={progressValue} className="h-2 bg-zaltyko-border" indicatorClassName="bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark" />
            </div>

            {/* Step Content */}
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="font-display text-3xl font-bold text-zaltyko-text-main">{heading}</h1>
                <p className="mt-2 text-zaltyko-text-secondary text-lg">{description}</p>
              </div>

              {/* Step 1: Account */}
              {step === 1 && (
                <form onSubmit={handleAccountRegistration} className="space-y-6">
                  <div className="space-y-4">
                    <FormField
                      label="Nombre completo"
                      error={error ?? undefined}
                      required
                      placeholder="Ej. María García"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                    />
                    <FormField
                      label="Correo electrónico"
                      required
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        label="Contraseña"
                        required
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                      <FormField
                        label="Confirmar contraseña"
                        required
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 shrink-0" />
                      <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading || !canGoNext}>
                    {loading ? "Creando cuenta..." : "Crear cuenta y continuar"}
                  </Button>

                  <p className="text-center text-sm text-zaltyko-text-secondary">
                    ¿Ya tienes cuenta?{" "}
                    <Link href="/auth/login" className="font-medium text-zaltyko-primary hover:underline">
                      Iniciar sesión
                    </Link>
                  </p>
                </form>
              )}

              {/* Step 2: Academy */}
              {step === 2 && (
                <form onSubmit={handleCreateAcademy} className="space-y-6">
                  <div className="space-y-4">
                    <FormField
                      label="Nombre de tu academia"
                      error={fieldErrors.name}
                      name="name"
                      required
                      placeholder="Ej. Club Gimnasia Elite"
                      value={academyName}
                      onChange={(e) => setAcademyName(e.target.value)}
                    />


                    <div className="space-y-2">
                      <label className="text-sm font-semibold">País</label>
                      {fieldErrors.country && (
                        <p className="text-xs text-red-600">{fieldErrors.country}</p>
                      )}
                      <SearchableSelect
                        options={COUNTRY_REGION_OPTIONS}
                        value={selectedCountry}
                        onChange={(val) => {
                          setSelectedCountry(val);
                          setSelectedCity("");
                        }}
                        placeholder="Selecciona país"
                      />
                    </div>

                    <FormField
                      label="Ciudad (opcional)"
                      error={fieldErrors.city}
                      placeholder="Ej. Madrid, Barcelona..."
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                    />


                    <div className="space-y-3">
                      <label className="text-sm font-medium text-zaltyko-text-main">Disciplina principal</label>
                      <div className="grid grid-cols-1 gap-3">
                        {ACADEMY_TYPES.map((type) => (
                          <div
                            key={type.value}
                            onClick={() => setAcademyType(type.value)}
                            className={cn(
                              "cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md",
                              academyType === type.value
                                ? "border-zaltyko-primary bg-zaltyko-primary/5 ring-1 ring-zaltyko-primary"
                                : "border-zaltyko-border bg-white hover:border-zaltyko-primary/50"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                                academyType === type.value ? "border-zaltyko-primary" : "border-zaltyko-text-light"
                              )}>
                                {academyType === type.value && <div className="h-2.5 w-2.5 rounded-full bg-zaltyko-primary" />}
                              </div>
                              <span className="font-medium text-zaltyko-text-main">{type.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 shrink-0" />
                      <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creando academia..." : "Crear academia"}
                  </Button>
                </form>
              )}


            </div>

            {/* Footer Actions */}
            {step > 1 && (
              <div className="mt-8 flex justify-center">
                <button onClick={handleGoBack} className="text-sm text-zaltyko-text-secondary hover:text-zaltyko-text-main transition-colors">
                  ← Volver atrás
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Visuals & Preview */}
      <div className="hidden lg:flex flex-1 bg-zaltyko-bg relative overflow-hidden items-center justify-center p-12">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 -z-10 h-[600px] w-[600px] rounded-full bg-zaltyko-primary/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 -z-10 h-[500px] w-[500px] rounded-full bg-zaltyko-accent-teal/10 blur-[100px]" />

        <div className="relative w-full max-w-xl">
          {/* Dynamic Preview Card based on Step */}
          <div className="glass-panel rounded-3xl p-8 shadow-2xl transform transition-all duration-500 hover:scale-[1.02]">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-12 w-12 rounded-full bg-zaltyko-primary/10 flex items-center justify-center text-zaltyko-primary">
                {step === 1 && <Users className="h-6 w-6" />}
                {step === 2 && <TrendingUp className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-zaltyko-text-main">
                  {step === 1 ? "Tu nueva oficina digital" : academyName || "Tu Academia"}
                </h3>
                <p className="text-sm text-zaltyko-text-secondary">
                  {step === 1 ? "Gestiona todo desde un solo lugar" : "Panel de control"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-32 rounded-xl bg-gradient-to-br from-zaltyko-bg to-white border border-zaltyko-border p-4 flex items-center justify-center">
                <p className="text-center text-sm text-zaltyko-text-secondary italic">
                  "Zaltyko ha transformado cómo gestionamos nuestras clases. ¡Es increíble!"
                </p>
              </div>
            </div>
          </div>

          {/* Testimonial / Tip */}
          <div className="mt-8 flex items-start gap-4 p-4 rounded-xl bg-white/40 backdrop-blur border border-white/40">
            <div className="h-8 w-8 rounded-full bg-zaltyko-accent-amber/20 flex items-center justify-center text-zaltyko-accent-amber shrink-0">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zaltyko-text-main">¿Sabías que?</p>
              <p className="text-xs text-zaltyko-text-secondary mt-1">
                Las academias que usan software de gestión ahorran un promedio de 15 horas mensuales en tareas administrativas.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Celebration Overlay */}
      {showCelebration && lastCompletedStep && (
        <StepCompletionCelebration
          show={showCelebration}
          stepNumber={lastCompletedStep.number}
          stepName={lastCompletedStep.name}
          onComplete={() => setShowCelebration(false)}
        />
      )}

    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useDevSession } from "@/components/dev-session-provider";
import { Progress } from "@/components/ui/progress";
import { FormField, validators } from "@/components/ui/form-field";
import { COUNTRY_REGION_OPTIONS, findRegionsByCountry, getRegionLabel, getRegionPlaceholder, getCityPlaceholder } from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";
import { ACADEMY_TYPES, onboardingCopy } from "@/lib/onboardingCopy";
import { createClient } from "@/lib/supabase/client";
import { isDevFeaturesEnabled } from "@/lib/dev";
import { trackEvent } from "@/lib/analytics";
import { useToast } from "@/components/ui/toast-provider";
import { getErrorMessage } from "@/lib/errors";
import { LimitIndicator } from "@/components/onboarding/LimitIndicator";
import { StepPreview } from "@/components/onboarding/StepPreview";
import { StepCompletionCelebration } from "@/components/onboarding/StepCompletionCelebration";
import { AutoSaveIndicator } from "@/components/onboarding/AutoSaveIndicator";
import { InteractiveTutorial } from "@/components/onboarding/InteractiveTutorial";
import { CsvImportDialog } from "@/components/onboarding/CsvImportDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ArrowUpRight, Clock, HelpCircle, Upload, CheckCircle2, AlertCircle, ArrowRight, Lock, TrendingUp } from "lucide-react";

interface CoachInput {
  name: string;
  email: string;
}

interface AthleteInput {
  name: string;
}

type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_FLOW: Array<{ id: StepKey; label: string }> = [
  { id: 1, label: "Cuenta" },
  { id: 2, label: "Academia" },
  { id: 3, label: "Estructura" },
  { id: 4, label: "Primer grupo" },
  { id: 5, label: "Atletas" },
  { id: 6, label: "Entrenadores" },
  { id: 7, label: "Pagos" },
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
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
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
    2: 3,
    3: 2,
    4: 3,
    5: 5,
    6: 3,
    7: 5,
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
        if (serverStep && serverStep > 0) {
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
            setMaxStep((prev) => (prev < 3 ? 3 : prev));
          }
        }
      } catch (error) {
        console.error("Error checking user academies:", error);
      }
    };
    checkUserAcademiesAndPlan();
  }, [effectiveUserId, step, academyId]);

  const copy = onboardingCopy[academyType] ?? onboardingCopy.artistica;
  const safeStep = (step <= 5 ? step : 5) as 1 | 2 | 3 | 4 | 5;
  const stepCopy = copy.steps[safeStep];
  const { heading, description, sectionTitle, sectionDescription, recommendations } = stepCopy;
  const regionOptions = useMemo(
    () => findRegionsByCountry(selectedCountry),
    [selectedCountry]
  );

  const cityOptions = useMemo(
    () => findCitiesByRegion(selectedCountry, selectedRegion),
    [selectedCountry, selectedRegion]
  );

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

  // Validar que la región seleccionada sea válida para el país actual
  useEffect(() => {
    if (!selectedCountry || regionOptions.length === 0) {
      return;
    }
    // Si hay una región seleccionada pero no está en las opciones válidas, resetearla
    if (selectedRegion && !regionOptions.some((region) => region.value === selectedRegion)) {
      setSelectedRegion("");
    }
  }, [regionOptions, selectedCountry, selectedRegion]);

  // Validar que la ciudad seleccionada sea válida para la región actual
  useEffect(() => {
    if (!selectedRegion || cityOptions.length === 0) {
      return;
    }
    // Si hay una ciudad seleccionada pero no está en las opciones válidas, resetearla
    if (selectedCity && !cityOptions.some((city) => city.value === selectedCity)) {
      setSelectedCity("");
    }
  }, [cityOptions, selectedRegion, selectedCity]);

  const canGoNext = useMemo(() => {
    if (step === 1) {
      return (
        email.length > 0 &&
        password.length >= 6 &&
        password === confirmPassword
      );
    }
    if (step === 2) return Boolean(academyId);
    if (step === 3) {
      return selectedDisciplines.length > 0 && structureGroups.some((group) => group.trim().length > 0);
    }
    if (step === 4) {
      return groupName.trim().length > 0 && groupStartTime && groupEndTime;
    }
    if (step === 5) {
      return athletes.some((athlete) => athlete.name.trim().length > 0);
    }
    if (step === 6) {
      return coaches.every((coach) => coach.email.includes("@") || coach.email.trim().length === 0);
    }
    return true;
  }, [
    academyId,
    athletes,
    coaches,
    confirmPassword,
    email.length,
    groupEndTime,
    groupName,
    groupStartTime,
    password,
    selectedDisciplines.length,
    structureGroups,
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
    const region = selectedRegion || (form.get("region") as string);
    const city = selectedCity || (form.get("city") as string);
    
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
    
    if (!region && regionOptions.length > 0) {
      errors.region = `Debes seleccionar una ${getRegionLabel(selectedCountry).toLowerCase()}`;
    }
    
    if (!city && cityOptions.length > 0) {
      errors.city = "Debes seleccionar una ciudad";
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
          region,
          city,
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
      setMaxStep((prev) => (prev < 3 ? 3 : prev));
      setLastCompletedStep({ number: 2, name: "Academia creada" });
      setShowCelebration(true);
      
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
      
      setStep(3);
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

  const handleStructureGroupChange = (index: number, value: string) => {
    setStructureGroups((prev) => {
      const clone = [...prev];
      clone[index] = value;
      return clone;
    });
  };

  const handleAddStructureGroup = () => {
    setStructureGroups((prev) => [...prev, ""]);
  };

  const handleStructureSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!academyId) {
      setError("Crea tu academia antes de definir la estructura.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const notes = `Disciplinas: ${selectedDisciplines.join(", ")} · Grupos: ${structureGroups
        .filter((group) => group.trim().length > 0)
        .join(", ")}`;
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(effectiveUserId ? { "x-user-id": effectiveUserId } : {}),
        },
        body: JSON.stringify({
          academyId,
          step: "structure",
          notes,
        }),
      });
      setStep(4);
      setMaxStep((prev) => (prev < 4 ? 4 : prev));
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "No se pudo guardar la estructura.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirstGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!academyId || !effectiveUserId) {
      setError("Completa los pasos previos antes de crear el primer grupo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const groupResponse = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": effectiveUserId,
        },
        body: JSON.stringify({
          academyId,
          name: groupName,
          discipline: groupDiscipline,
          level: groupLevel,
        }),
      });

      if (!groupResponse.ok) {
        const body = await groupResponse.json().catch(() => ({}));
        throw new Error(body?.error ?? "No se pudo crear el grupo");
      }

      await fetch("/api/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": effectiveUserId,
        },
        body: JSON.stringify({
          academyId,
          name: `${groupName} · Clase`,
          weekday: Number(groupWeekday),
          startTime: groupStartTime,
          endTime: groupEndTime,
        }),
      });

      setStep(5);
      setMaxStep((prev) => (prev < 5 ? 5 : prev));
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "No se pudo crear el primer grupo.");
    } finally {
      setLoading(false);
    }
  };

  const handleInviteCoaches = async () => {
    if (!academyId || !effectiveUserId) {
      setError("Completa los pasos previos o crea tu cuenta.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = coaches.filter((coach) => coach.email);
      for (const coach of payload) {
        await fetch("/api/invitations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": effectiveUserId,
          },
          body: JSON.stringify({
            academyId,
            email: coach.email,
            role: "coach",
          }),
        });
      }
      setLastCompletedStep({ number: 6, name: "Entrenadores invitados" });
      setShowCelebration(true);
      setStep(7);
      setMaxStep((prev) => (prev < 7 ? 7 : prev));
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "No se pudieron enviar las invitaciones.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfigurePayments = async () => {
    if (!academyId || !effectiveUserId) {
      setError("Necesitas una academia activa antes de configurar pagos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": effectiveUserId,
        },
        body: JSON.stringify({ academyId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo activar la configuración de pagos");
      }
      update({ academyId });
      router.push(`/app/${academyId}/dashboard`);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Error al configurar pagos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAthletes = async (athletesToCreate?: Array<{ name: string }>) => {
    if (!academyId) {
      setError("❌ Primero debes crear una academia. Por favor, completa el paso 2 antes de continuar.");
      toast.pushToast({
        title: "Academia requerida",
        description: "Necesitas crear una academia antes de añadir atletas.",
        variant: "error",
      });
      return;
    }
    if (!effectiveUserId) {
      setError("❌ Debes crear una cuenta primero. Por favor, completa el paso 1.");
      return;
    }
    
    const payload = athletesToCreate || athletes.filter((athlete) => athlete.name);
    
    if (payload.length === 0) {
      setError("⚠️ Por favor, añade al menos un atleta. Escribe el nombre en los campos de arriba o importa un archivo CSV.");
      toast.pushToast({
        title: "Sin atletas",
        description: "Debes agregar al menos un atleta para continuar.",
        variant: "error",
      });
      return;
    }
    
    // Validar que todos los nombres sean válidos
    const invalidAthletes = payload.filter(a => !a.name || a.name.trim().length < 2);
    if (invalidAthletes.length > 0) {
      setError(`⚠️ Por favor, corrige los nombres de los atletas. Todos los nombres deben tener al menos 2 caracteres.`);
      toast.pushToast({
        title: "Nombres inválidos",
        description: "Algunos nombres de atletas son muy cortos o están vacíos.",
        variant: "error",
      });
      return;
    }
    
    setLoading(true);
    setError(null);
    const isImport = !!athletesToCreate;
    try {
      let createdCount = 0;
      let limitError: { message: string; upgradeTo?: string } | null = null;

      for (const athlete of payload) {
        try {
          const response = await fetch("/api/athletes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": effectiveUserId,
            },
            body: JSON.stringify({
              academyId,
              name: athlete.name,
            }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            if (response.status === 402 && data.error === "LIMIT_REACHED") {
              const upgradeInfo = data.details?.upgradeInfo;
              let message = data.message || "Has alcanzado el límite de atletas de tu plan.";
              if (upgradeInfo) {
                message = `Has alcanzado el límite de atletas de tu plan actual. Actualiza a ${upgradeInfo.plan.toUpperCase()} (${upgradeInfo.price}) para agregar más atletas.`;
              }
              limitError = {
                message,
                upgradeTo: upgradeInfo?.plan || data.details?.upgradeTo,
              };
              break; // Detener el loop si se alcanza el límite
            }
            throw new Error(data.error || data.message || "Error al crear atleta");
          }
          createdCount++;
        } catch (err: unknown) {
          // Si es un error de límite, ya lo capturamos arriba
          if (limitError) break;
          throw err;
        }
      }

      if (limitError) {
        const upgradeMessage = limitError.upgradeTo 
          ? ` Actualiza a ${limitError.upgradeTo.toUpperCase()} desde la sección de facturación para agregar más atletas.`
          : "";
        setError(
          `${limitError.message} ${createdCount > 0 ? `Se crearon ${createdCount} de ${payload.length} atletas.` : ""}${upgradeMessage}`
        );
        // Continuar al siguiente paso aunque haya error de límite
        if (createdCount > 0) {
          setLastCompletedStep({ number: 5, name: `${createdCount} atleta${createdCount > 1 ? "s" : ""} creado${createdCount > 1 ? "s" : ""}` });
          setShowCelebration(true);
          setStep(6);
          setMaxStep((prev) => (prev < 6 ? 6 : prev));
        }
      } else if (createdCount > 0) {
        setLastCompletedStep({ number: 5, name: `${createdCount} atleta${createdCount > 1 ? "s" : ""} creado${createdCount > 1 ? "s" : ""}` });
        setShowCelebration(true);
        setStep(6);
        setMaxStep((prev) => (prev < 6 ? 6 : prev));
        toast.pushToast({
          title: "Atletas creados",
          description: `Se crearon ${createdCount} atleta${createdCount === 1 ? "" : "s"} exitosamente.`,
          variant: "success",
        });
        
        // Si se importaron desde CSV, actualizar la lista local
        if (isImport && athletesToCreate) {
          setAthletes([...athletesToCreate, ...athletes.filter(a => !a.name)]);
        }
      }
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      toast.pushToast({
        title: "Error al crear atletas",
        description: errorMessage,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-10 lg:space-y-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{heading}</h1>
          <p className="max-w-3xl text-base text-muted-foreground lg:text-lg">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-semibold text-muted-foreground underline underline-offset-4 transition hover:text-foreground"
        >
          Salir y volver
        </button>
      </header>

      <div className="space-y-4">
        <Progress value={progressValue} className="h-3 rounded-full bg-muted/60" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Paso {currentIndex + 1} de {totalSteps} · {STEP_FLOW[currentIndex]?.label}
          </span>
          <span className="font-semibold">{Math.round(progressValue)}%</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STEP_FLOW.map((definition, index) => {
            const isActive = step === definition.id;
            const isCompleted = step > definition.id;
            const isEnabled = definition.id <= maxStep;
            return (
              <button
                key={definition.id}
                type="button"
                onClick={() => handleStepChange(definition.id)}
                disabled={!isEnabled}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background lg:text-sm ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : isCompleted
                    ? "border-primary/40 bg-primary/5 text-primary/70 hover:border-primary/60"
                    : "border-border bg-background/60 text-muted-foreground hover:border-border/70"
                } ${!isEnabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current">
                  {index + 1}
                </span>
                <span className="font-medium">{definition.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="space-y-6">
          <AutoSaveIndicator isSaving={isAutoSaving} lastSaved={lastSaved} className="ml-auto" />
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-2">
              <p>{error}</p>
              {(error.includes("ACADEMY_LIMIT_REACHED") || error.includes("LIMIT_REACHED") || error.includes("Actualiza a")) && (
                <Link
                  href="/billing"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Ver planes y actualizar
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}

          {/* Aviso demo: oculto cuando las features de demo están deshabilitadas */}
          {!session?.userId && !loadingSession && isDevFeaturesEnabled && (
            <div className="space-y-3 rounded-lg border border-amber-400/60 bg-amber-400/10 px-4 py-3 text-sm text-amber-900">
              <p>
                No detectamos un usuario demo. Desde la portada pulsa &quot;Crear academia demo&quot; o refresca la sesión usando el botón inferior.
              </p>
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center justify-center rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold hover:bg-amber-400/20"
              >
                Refrescar sesión demo
              </button>
            </div>
          )}

          {step === 1 &&
            (!effectiveUserId ? (
              <form onSubmit={handleAccountRegistration} className="space-y-5">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Paso {getStepOrder(1)}
                  </span>
                  <h2 className="text-xl font-semibold">{sectionTitle}</h2>
                  <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    id="fullName"
                    label="Nombre completo"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    validator={validators.combine(
                      validators.required("El nombre es obligatorio"),
                      validators.minLength(2, "El nombre debe tener al menos 2 caracteres")
                    )}
                    validateOnChange={true}
                    validateOnBlur={true}
                    disabled={loading}
                  />
                  <FormField
                    id="email"
                    label="Correo electrónico"
                    type="email"
                    value={email || ""}
                    onChange={(event) => setEmail(event.target.value)}
                    validator={validators.combine(
                      validators.required("El correo es obligatorio"),
                      validators.email("Ingresa un correo válido")
                    )}
                    validateOnChange={true}
                    validateOnBlur={true}
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    id="password"
                    label="Contraseña"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    validator={validators.combine(
                      validators.required("La contraseña es obligatoria"),
                      validators.minLength(6, "La contraseña debe tener al menos 6 caracteres")
                    )}
                    validateOnChange={true}
                    validateOnBlur={true}
                    disabled={loading}
                  />
                  <FormField
                    id="confirmPassword"
                    label="Confirmar contraseña"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    validator={(value) => {
                      if (!value) return "Confirma tu contraseña";
                      if (value !== password) return "Las contraseñas no coinciden";
                      return null;
                    }}
                    validateOnChange={true}
                    validateOnBlur={true}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={loading}
                  >
                    Crear cuenta y continuar
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Paso {getStepOrder(1)}
                  </span>
                  <h2 className="text-lg font-semibold text-foreground">{sectionTitle}</h2>
                  <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                </div>
                <p>
                  Ya encontramos una cuenta activa en esta sesión. Puedes continuar con los
                  siguientes pasos o volver para actualizar la información cuando lo necesites.
                </p>
                <div className="flex flex-wrap gap-3 text-xs font-medium">
                  <span className="rounded-md border border-border bg-background px-3 py-2">
                    Usuario: {email || "Registrado"}
                  </span>
                  <span className="rounded-md border border-border bg-background px-3 py-2 text-zaltyko-primary">
                    Paso completado
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStepChange(2)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Ir al siguiente paso
                </button>
              </div>
            ))}

          {step === 2 && (
            <>
              {/* Si tiene academia y alcanzó el límite de su plan */}
              {userHasAcademies && existingAcademies.length > 0 && userPlanInfo && !userPlanInfo.canCreateMore && !academyId ? (
                <div className="space-y-4 rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                      <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">Límite de academias alcanzado</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          Tu plan <span className="font-semibold text-foreground uppercase">{userPlanInfo.planCode}</span> permite crear hasta{" "}
                          <span className="font-semibold text-foreground">
                            {userPlanInfo.academyLimit === null ? "ilimitadas" : userPlanInfo.academyLimit}
                          </span>{" "}
                          academia{userPlanInfo.academyLimit === 1 ? "" : "s"}.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Actualmente tienes <span className="font-semibold text-foreground">{userPlanInfo.currentAcademyCount}</span> academia
                          {userPlanInfo.currentAcademyCount !== 1 ? "s" : ""}:{" "}
                          <span className="font-medium text-foreground">{existingAcademies[0].name || "Sin nombre"}</span>
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (existingAcademies.length > 0) {
                              setAcademyId(existingAcademies[0].id);
                              setMaxStep((prev) => (prev < 3 ? 3 : prev));
                              setStep(3);
                            }
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-muted"
                        >
                          Continuar con mi academia actual
                          <ArrowRight className="h-4 w-4" />
                        </button>
                        {userPlanInfo.upgradeTo && (
                          <Link
                            href="/billing"
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                          >
                            <TrendingUp className="h-4 w-4" />
                            Actualizar a {userPlanInfo.upgradeTo.toUpperCase()}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : userHasAcademies && existingAcademies.length > 0 && !academyId ? (
                <div className="space-y-4 rounded-lg border border-primary/40 bg-primary/5 p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground mb-1">Ya tienes una academia creada</h3>
                        <p className="text-sm text-muted-foreground">
                          Academia: <span className="font-semibold text-foreground">{existingAcademies[0].name || "Sin nombre"}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (existingAcademies.length > 0) {
                            setAcademyId(existingAcademies[0].id);
                            setMaxStep((prev) => (prev < 3 ? 3 : prev));
                            setStep(3);
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                      >
                        Ir al siguiente paso
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateAcademy} className="space-y-5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paso {getStepOrder(2)}
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>~{STEP_TIME_ESTIMATES[2]} min</span>
                </div>
              </div>
              <h2 className="text-xl font-semibold">{sectionTitle}</h2>
              <p className="text-sm text-muted-foreground">{sectionDescription}</p>
            </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nombre de la academia</label>
                <input
                  name="name"
                  value={academyName}
                  onChange={(e) => setAcademyName(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {(academyName || selectedCountry || selectedRegion || selectedCity || academyType) && (
                <StepPreview
                  step={2}
                  data={{
                    name: academyName,
                    academyType,
                    country: selectedCountry ? COUNTRY_REGION_OPTIONS.find(c => c.value === selectedCountry)?.label : undefined,
                    region: selectedRegion ? findRegionsByCountry(selectedCountry).find(r => r.value === selectedRegion)?.label : undefined,
                    city: selectedCity ? findCitiesByRegion(selectedCountry, selectedRegion).find(c => c.value === selectedCity)?.label : undefined,
                  }}
                />
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">País</label>
                  <SearchableSelect
                    options={COUNTRY_REGION_OPTIONS.map(c => ({ value: c.value, label: c.label }))}
                    value={selectedCountry}
                    onChange={(value) => {
                      setSelectedCountry(value);
                      setSelectedRegion("");
                      setSelectedCity("");
                    }}
                    placeholder="Selecciona un país"
                    required
                    name="country"
                    searchPlaceholder="Buscar país..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{getRegionLabel(selectedCountry)}</label>
                  <SearchableSelect
                    options={regionOptions}
                    value={selectedRegion}
                    onChange={(value) => {
                      setSelectedRegion(value);
                      setSelectedCity("");
                    }}
                    placeholder={getRegionPlaceholder(selectedCountry, !!selectedCountry)}
                    disabled={!selectedCountry || regionOptions.length === 0}
                    required={regionOptions.length > 0}
                    name="region"
                    searchPlaceholder={`Buscar ${getRegionLabel(selectedCountry).toLowerCase()}...`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Ciudad</label>
                  <SearchableSelect
                    options={cityOptions}
                    value={selectedCity}
                    onChange={setSelectedCity}
                    placeholder={getCityPlaceholder(getRegionLabel(selectedCountry), !!selectedRegion)}
                    disabled={!selectedRegion || cityOptions.length === 0}
                    required={cityOptions.length > 0}
                    name="city"
                    searchPlaceholder="Buscar ciudad..."
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tipo de academia</label>
                <select
                  name="academyType"
                  value={academyType}
                  onChange={(event) =>
                    setAcademyType(event.target.value as (typeof ACADEMY_TYPES)[number]["value"])
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {ACADEMY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Personaliza la experiencia según la disciplina principal de tu academia.
                </p>
              </div>
              {effectiveUserId && (
                <LimitIndicator academyId={null} resource="academies" className="mt-2" />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading}
                >
                  Guardar y continuar
                </button>
              </div>
            </form>
              )}
            </>
          )}

          {step === 3 && (
            <form onSubmit={handleStructureSubmit} className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Paso {getStepOrder(3)} (Opcional)
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>~{STEP_TIME_ESTIMATES[3]} min</span>
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold">{sectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(4);
                      setMaxStep((prev) => (prev < 4 ? 4 : prev));
                    }}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    Saltar paso
                  </button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {DISCIPLINE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedDisciplines.includes(option.value)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedDisciplines((prev) =>
                          checked ? Array.from(new Set([...prev, option.value])) : prev.filter((value) => value !== option.value)
                        );
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Grupos sugeridos</label>
                {structureGroups.map((group, index) => (
                  <input
                    key={`structure-${index}`}
                    value={group}
                    onChange={(event) => handleStructureGroupChange(index, event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ))}
                <button
                  type="button"
                  onClick={handleAddStructureGroup}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Añadir otro grupo
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading || !canGoNext}
                >
                  Guardar y continuar
                </button>
              </div>
            </form>
          )}

          {step === 4 && (
            <form onSubmit={handleCreateFirstGroup} className="space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paso {getStepOrder(4)}
                </span>
                <h2 className="text-xl font-semibold">{sectionTitle}</h2>
                <p className="text-sm text-muted-foreground">{sectionDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nombre del grupo</label>
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Disciplina</label>
                  <select
                    value={groupDiscipline}
                    onChange={(event) =>
                      setGroupDiscipline(event.target.value as (typeof ACADEMY_TYPES)[number]["value"])
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {ACADEMY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nivel</label>
                  <select
                    value={groupLevel}
                    onChange={(event) => setGroupLevel(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Iniciación">Iniciación</option>
                    <option value="Juvenil">Juvenil</option>
                    <option value="Competición">Competición</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Día</label>
                  <select
                    value={groupWeekday}
                    onChange={(event) => setGroupWeekday(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="1">Lunes</option>
                    <option value="2">Martes</option>
                    <option value="3">Miércoles</option>
                    <option value="4">Jueves</option>
                    <option value="5">Viernes</option>
                    <option value="6">Sábado</option>
                    <option value="0">Domingo</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hora de inicio</label>
                  <input
                    type="time"
                    value={groupStartTime}
                    onChange={(event) => setGroupStartTime(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hora de fin</label>
                  <input
                    type="time"
                    value={groupEndTime}
                    onChange={(event) => setGroupEndTime(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading || !canGoNext}
                >
                  Guardar y continuar
                </button>
              </div>
            </form>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Paso {getStepOrder(5)}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>~{STEP_TIME_ESTIMATES[5]} min</span>
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold">{sectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(6);
                      setMaxStep((prev) => (prev < 6 ? 6 : prev));
                    }}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    Saltar paso
                  </button>
                </div>
              </div>
              {academyId && (
                <LimitIndicator academyId={academyId} resource="athletes" className="mb-4" />
              )}
              {athletes.filter((a) => a.name).length > 0 && (
                <StepPreview
                  step={5}
                  data={{ athletes }}
                />
              )}
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Añadir atletas</p>
                <button
                  type="button"
                  onClick={() => setShowCsvImport(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importar CSV
                </button>
              </div>
              <div className="space-y-3">
                {athletes.map((athlete, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={athlete.name}
                      onChange={(event) => {
                        const updated = [...athletes];
                        updated[index] = { ...updated[index], name: event.target.value };
                        setAthletes(updated);
                      }}
                      placeholder={`Nombre del atleta ${index + 1}`}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {athletes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAthletes((prev) => prev.filter((_, i) => i !== index));
                        }}
                        className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setAthletes((prev) => [...prev, { name: "" }]);
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Añadir otro atleta
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateAthletes()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading || !canGoNext}
                >
                  {loading ? "Creando..." : "Crear atletas y continuar"}
                </button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Paso {getStepOrder(6)} (Opcional)
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>~{STEP_TIME_ESTIMATES[6]} min</span>
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold">{sectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(7);
                      setMaxStep((prev) => (prev < 7 ? 7 : prev));
                    }}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    Saltar paso
                  </button>
                </div>
              </div>
              {coaches.filter((c) => c.email).length > 0 && (
                <StepPreview
                  step={6}
                  data={{ coaches }}
                />
              )}
              <div className="space-y-3">
                {coaches.map((coach, index) => (
                  <div key={index} className="grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={coach.name}
                      onChange={(event) => {
                        const updated = [...coaches];
                        updated[index] = { ...updated[index], name: event.target.value };
                        setCoaches(updated);
                      }}
                      placeholder="Nombre del entrenador"
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={coach.email}
                        onChange={(event) => {
                          const updated = [...coaches];
                          updated[index] = { ...updated[index], email: event.target.value };
                          setCoaches(updated);
                        }}
                        placeholder="correo@ejemplo.com"
                        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {coaches.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCoaches((prev) => prev.filter((_, i) => i !== index));
                          }}
                          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCoaches((prev) => [...prev, { name: "", email: "" }]);
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Añadir otro entrenador
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleInviteCoaches}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading || !canGoNext}
                >
                  {loading ? "Enviando invitaciones..." : "Enviar invitaciones y continuar"}
                </button>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Paso {getStepOrder(7)} (Opcional)
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>~{STEP_TIME_ESTIMATES[7]} min</span>
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold">{sectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/app/${academyId}/dashboard`);
                    }}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    Saltar y continuar
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 text-sm">
                <p className="font-semibold text-primary">
                  Configura tus métodos de cobro con Stripe para automatizar mensualidades y evitar recordatorios manuales.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>No cobramos comisiones adicionales.</li>
                  <li>Puedes conectar tu cuenta bancaria existente.</li>
                  <li>Activa recordatorios automáticos para padres.</li>
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={handleConfigurePayments}
                  disabled={loading}
                >
                  Activar configuración de pagos
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Si prefieres hacerlo más tarde, puedes acceder desde el módulo de facturación.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:space-y-6">
          <div className="rounded-xl border bg-card/70 p-6 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recomendaciones
            </h2>
            <ul className="mt-3 space-y-2">
              {recommendations.map((tip, index) => (
                <li key={index} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
          {isDevFeaturesEnabled && (
            <button
              type="button"
              onClick={refresh}
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
            >
              Refrescar sesión demo
            </button>
          )}
        </aside>
      </div>
      
      {showCelebration && lastCompletedStep && (
        <StepCompletionCelebration
          show={showCelebration}
          stepNumber={lastCompletedStep.number}
          stepName={lastCompletedStep.name}
          onComplete={() => {
            setShowCelebration(false);
            setLastCompletedStep(null);
          }}
        />
      )}

      {/* Tutorial interactivo - solo para usuarios nuevos en paso 2 */}
      {step === 2 && !academyId && showTutorial && (
        <InteractiveTutorial
          steps={[
            {
              id: "academy-name",
              target: 'input[name="name"]',
              title: "Nombre de tu academia",
              description: "Escribe el nombre oficial de tu academia. Este nombre aparecerá en todos los reportes y comunicaciones.",
              position: "bottom",
            },
            {
              id: "academy-location",
              target: 'select[name="country"]',
              title: "Ubicación",
              description: `Selecciona el país, ${getRegionLabel(selectedCountry).toLowerCase()} y ciudad donde está ubicada tu academia. Esto nos ayuda a personalizar la experiencia.`,
              position: "bottom",
            },
            {
              id: "academy-type",
              target: 'select[name="academyType"]',
              title: "Tipo de academia",
              description: "Elige el tipo principal de tu academia. Esto personaliza las funcionalidades y reportes específicos para tu disciplina.",
              position: "bottom",
            },
          ]}
          onComplete={() => setShowTutorial(false)}
          onSkip={() => setShowTutorial(false)}
          enabled={showTutorial}
        />
      )}

      {/* Dialog de importación CSV */}
      <CsvImportDialog
        open={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        onImport={handleCreateAthletes}
        academyId={academyId}
      />
    </div>
  );
}

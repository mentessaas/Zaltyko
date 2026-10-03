"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";
import { checkPwnedPassword, PWNED_PASSWORD_MESSAGE } from "@/lib/security/pwned-password";
import { trackEvent } from "@/lib/analytics";
import { trackGoogleAdsConversion } from "@/lib/google-ads";
import {
  readUtmWithFallback,
} from "@/lib/growth/utm";
import { getRegistrationContinuationPath } from "@/lib/auth/registration-paths";
import { getNextRegistrationRoleIndex } from "@/lib/auth/registration-role-navigation";
import { useHydrated } from "@/lib/auth/use-hydrated";

// Lee UTMs del first-touch capturado por `UtmCapture` (sessionStorage)
// o de la query string actual. Wrapper sobre `readUtmWithFallback` para
// tipar más estrecho y evitar repetir la plumbing. Devuelve SIEMPRE los 5
// campos (con fallback `direct/none/...`) para mantener trazabilidad.
function readAttribution(): {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
} {
  if (typeof window === "undefined") {
    return readUtmWithFallback(new URLSearchParams(), undefined);
  }
  return readUtmWithFallback(
    new URLSearchParams(window.location.search),
    window.sessionStorage,
  );
}

  const ROLE_OPTIONS = [
  {
    value: "owner",
    label: "Dueño de academia",
    description: "Crear y gestionar una academia.",
  },
  {
    value: "coach",
    label: "Entrenador",
    description: "Tener perfil profesional y aceptar academias.",
  },
  {
    value: "parent",
    label: "Padre / tutor",
    description: "Seguir hijos y academias vinculadas.",
  },
  {
    value: "athlete",
    label: "Atleta",
    description: "Acceder a progreso, avisos e invitaciones.",
  },
  {
    value: "provider",
    label: "Proveedor",
    description: "Publicar productos o servicios en marketplace.",
  },
] as const;

type RegisterRole = (typeof ROLE_OPTIONS)[number]["value"];

// Must match app_config.consent.policy_version in the reviewed migration.
const LEGAL_CONSENT_VERSION = "v1-2026-08-01";
const LEGAL_CONSENT_PROOF = "signup:register-form-v1";

export function RegisterForm({directoryDiscoveryEnabled=false}:{directoryDiscoveryEnabled?:boolean}={}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const isHydrated = useHydrated();
  const directoryNext = isHydrated
    ? new URLSearchParams(window.location.search).get("next")
    : null;
  const directoryRegistration=Boolean(directoryNext&&/^\/(academias|events|directorio)\//.test(directoryNext)&&!directoryNext.includes('\\'));
  const [role, setRole] = useState<RegisterRole>("owner");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const roleButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const handleRoleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    const nextIndex = getNextRegistrationRoleIndex(
      event.key,
      currentIndex,
      ROLE_OPTIONS.length
    );
    if (nextIndex === null) return;

    event.preventDefault();
    const nextRole = ROLE_OPTIONS[nextIndex].value;
    setRole(nextRole);
    roleButtonRefs.current[nextIndex]?.focus();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Micro-conversion: cta_click. Se emite ANTES de las validaciones para
    // que Google Ads pueda optimizar por clics en el CTA real, no por
    // submits completados que terminan en error de validación.
    void trackEvent("cta_click", {
      metadata: {
        cta_id: "register_submit",
        cta_position: "register_form",
        ...readAttribution(),
      },
    });
    // Google Ads también recibe cta_click para optimización temprana.
    if (!directoryRegistration) trackGoogleAdsConversion("cta_click_register");

    if (!fullName.trim()) {
      toast.pushToast({
        title: "Nombre requerido",
        description: "Necesitamos tu nombre para crear la cuenta.",
        variant: "error",
      });
      return;
    }

    if (!isValidEmail(email)) {
      toast.pushToast({
        title: "Correo inválido",
        description: "Usa un correo válido para continuar.",
        variant: "error",
      });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      toast.pushToast({
        title: "Correo inválido",
        description: "No pudimos interpretar ese correo.",
        variant: "error",
      });
      return;
    }

    if (password.trim().length < 8) {
      toast.pushToast({
        title: "Contraseña demasiado corta",
        description: "Usa al menos 8 caracteres.",
        variant: "error",
      });
      return;
    }

    if (!termsAccepted) {
      toast.pushToast({
        title: "Aceptación necesaria",
        description: "Lee y acepta los términos y la política de privacidad para crear tu cuenta.",
        variant: "error",
      });
      return;
    }

    // Verificar que la contraseña no aparezca en filtraciones públicas conocidas
    // (HaveIBeenPwned, k-anonymity). Falla en abierto si la API no responde —
    // el helper registra el caso y deja pasar al usuario.
    try {
      const pwned = await checkPwnedPassword(password);
      if (pwned.pwned) {
        toast.pushToast({
          title: "Contraseña comprometida",
          description: PWNED_PASSWORD_MESSAGE,
          variant: "error",
        });
        return;
      }
    } catch {
      // Nunca bloquear el signup por un fallo del check (la API externa puede
      // estar caída); la política fail-open del helper ya cubre este caso,
      // pero un try/catch adicional protege contra errores inesperados.
    }

    setLoading(true);
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(directoryRegistration?directoryNext!:"/auth/redirect")}`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            initial_role: directoryRegistration ? undefined : role,
            directory_account: directoryRegistration,
            // Metadata is only a hand-off for the server-side consent record;
            // authorization must never rely on user-editable user_metadata.
            legal_consent_version: LEGAL_CONSENT_VERSION,
            legal_consent_proof: LEGAL_CONSENT_PROOF,
          },
          emailRedirectTo,
        },
      });

      if (error) {
        toast.pushToast({
          title: "No pudimos crear la cuenta",
          description: error.message,
          variant: "error",
        });
        return;
      }

      toast.pushToast({
        title: directoryRegistration ? "Cuenta del directorio creada" : role === "owner" ? "Cuenta creada; falta tu academia" : "Cuenta creada",
        description: directoryRegistration ? "Puedes consultar tus fichas y solicitar representación; no se ha creado una academia ni una suscripción." : data.session
          ? role === "owner"
            ? "Ahora configuraremos tu academia para que puedas empezar."
            : "Vamos a llevarte a tu espacio en Zaltyko."
          : role === "owner"
            ? "Revisa tu correo; después configuraremos tu academia."
            : "Revisa tu correo para confirmar la cuenta y entrar a tu espacio en Zaltyko.",
        variant: "success",
      });

      if (data.session) {
        // Instrumentación paid-acquisition: emite sign_up_completed solo
        // cuando hay sesión (signup funcional, no email-pendiente). La
        // atribución UTMs viaja en metadata para que PostHog/Google Ads
        // puedan reconciliar origen paid.
        const attribution = readAttribution();
        await trackEvent(directoryRegistration ? "directory_account_registered" : "sign_up_completed", {
          userId: data.session.user.id,
          metadata: {
            role: directoryRegistration ? "directory" : role,
            signup_method: "email_password",
            // `direct` es el fallback cuando no hay UTMs (ver UTM_DIRECT_FALLBACK);
            // distinguir paid vs organic/direct ayuda a segmentar PostHog.
            has_utm_source: attribution.utm_source !== "direct",
            ...attribution,
          },
        });

        // Google Ads conversion — el label real lo configura Elvis en la
        // cuenta de Google Ads (Tools → Conversions) y se mapea aquí cuando
        // esté listo. Sin label, gtag ignora el evento silenciosamente.
        if (!directoryRegistration) trackGoogleAdsConversion("signup_completed");

        if(directoryRegistration){router.push(directoryNext!);return;}
        const profileResponse = await fetch("/api/onboarding/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fullName.trim(), role }),
        });
        if (!profileResponse.ok) {
          const profileError = await profileResponse.json().catch(() => null);
          toast.pushToast({
            title: "Cuenta creada, configuración pendiente",
            description:
              profileError?.message ??
              "No pudimos preparar tu perfil. Puedes reintentarlo al entrar.",
            variant: "warning",
            persistent: true,
          });
          router.push("/auth/login?profile_setup=retry");
          return;
        }
        router.push(getRegistrationContinuationPath(role));
      } else {
        await trackEvent(directoryRegistration ? "directory_account_registered" : "sign_up_completed", {
          metadata: {
            role: directoryRegistration ? "directory" : role,
            signup_method: "email_password",
            email_confirmation_pending: true,
            ...readAttribution(),
          },
        });
        router.push(`/auth/login?registered=1${directoryRegistration?`&next=${encodeURIComponent(directoryNext!)}`:""}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (!termsAccepted) {
      toast.pushToast({
        title: "Aceptación necesaria",
        description: "Lee y acepta los términos y la política de privacidad para crear tu cuenta.",
        variant: "error",
      });
      return;
    }

    setGoogleLoading(true);
    try {
      const next = directoryRegistration ? directoryNext! :
        `/auth/redirect?initial_role=${encodeURIComponent(role)}` +
        `&legal_consent_version=${encodeURIComponent(LEGAL_CONSENT_VERSION)}` +
        `&legal_consent_proof=${encodeURIComponent(LEGAL_CONSENT_PROOF)}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${directoryRegistration ? `&directory_account=1&legal_consent_version=${encodeURIComponent(LEGAL_CONSENT_VERSION)}&legal_consent_proof=${encodeURIComponent(LEGAL_CONSENT_PROOF)}` : ""}`,
          // Keep the identity scopes required by Supabase to create or link
          // the account with the user's email and basic profile.
          scopes: "openid email profile",
          // Navegamos explícitamente después de recibir la URL. Esto evita
          // que navegadores embebidos o bloqueadores de popup dejen el CTA
          // permanentemente en estado "Conectando...".
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        toast.pushToast({
          title: "Error al continuar con Google",
          description: error.message,
          variant: "error",
        });
        setGoogleLoading(false);
        return;
      }
      if (!data?.url) {
        toast.pushToast({
          title: "No pudimos iniciar Google",
          description: "El proveedor no devolvió una URL de autenticación. Inténtalo de nuevo.",
          variant: "error",
        });
        setGoogleLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      toast.pushToast({
        title: "Error inesperado",
        description: "No se pudo continuar con Google",
        variant: "error",
      });
      setGoogleLoading(false);
    }
  };

  return (
    <AuthPageShell
      title="Crea tu cuenta"
      description="Crea tu acceso personal y elige cómo quieres usar Zaltyko."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href={directoryRegistration ? `/auth/login?next=${encodeURIComponent(directoryNext!)}` : "/auth/login"} className="font-semibold text-zaltyko-primary hover:underline">
            Inicia sesión
          </Link>
        </>
      }
      sideTitle="Una cuenta, varios vínculos"
      sideDescription="Tu cuenta es tuya. Luego puedes crear una academia, aceptar invitaciones o publicar como proveedor."
      highlights={[
        "Padres, atletas, entrenadores y proveedores pueden tener cuenta propia.",
        "Las academias se vinculan por invitación o solicitud aceptada.",
        "Si sales de una academia, conservas tu cuenta global.",
      ]}
    >
      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          {!directoryRegistration && <Label>Tipo de cuenta</Label>}
          <div style={directoryRegistration ? { display: "none" } : undefined} className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de cuenta">
            {ROLE_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                ref={(element) => {
                  roleButtonRefs.current[index] = element;
                }}
                onClick={() => setRole(option.value)}
                onKeyDown={(event) => handleRoleKeyDown(event, index)}
                role="radio"
                aria-checked={role === option.value}
                tabIndex={role === option.value ? 0 : -1}
                className={`min-h-[82px] rounded-xl border px-3 py-2.5 text-left transition sm:px-4 sm:py-3 ${
                  role === option.value
                    ? "border-zaltyko-teal bg-zaltyko-teal/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-zaltyko-teal/50"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs">{option.description}</span>
              </button>
            ))}
          </div>
          {role === "owner" && !directoryRegistration && (
            <div className="rounded-lg border border-zaltyko-teal/30 bg-zaltyko-teal/5 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Importante:</span> primero crearás tu cuenta personal. {directoryDiscoveryEnabled ? "Después podrás buscar tu academia y solicitar su reclamación si ya existe, o crear una sede nueva." : "Después te guiaremos para crear la academia y configurar tu espacio de trabajo."}
              {directoryDiscoveryEnabled && <Link href="/academias" className="mt-2 block font-semibold underline">Buscar mi academia antes de crear la cuenta</Link>}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-required="true"
            autoComplete="name"
            placeholder="María García"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            autoComplete="email"
            placeholder="tu@email.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-required="true"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            name="termsAccepted"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            aria-required="true"
            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-zaltyko-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-offset-2"
          />
          <span>
            Acepto los{" "}
            <Link href="/terminos" target="_blank" rel="noreferrer" className="font-semibold text-zaltyko-primary underline hover:text-zaltyko-primary-dark">
              términos y condiciones
            </Link>{" "}
            y he leído la{" "}
            <Link href="/politica-privacidad" target="_blank" rel="noreferrer" className="font-semibold text-zaltyko-primary underline hover:text-zaltyko-primary-dark">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        <Button type="submit" className="w-full" disabled={loading || googleLoading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creando cuenta...
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>

      <div className="mt-4">
        <Button
          type="button"
          formNoValidate
          onClick={handleGoogleSignUp}
          variant="outline"
          className="w-full"
          disabled={!isHydrated || googleLoading || loading}
          aria-busy={!isHydrated || googleLoading}
        >
          {googleLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Conectando...
            </>
          ) : !isHydrated ? (
            "Preparando Google..."
          ) : (
            "Crear cuenta con Google"
          )}
        </Button>
      </div>

      {(role === "owner" || directoryRegistration) && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {directoryRegistration ? "Consultar y reclamar fichas es gratis. No activa ninguna suscripción." : "7 días de Starter sin tarjeta · Sin permanencia"}
        </p>
      )}
    </AuthPageShell>
  );
}

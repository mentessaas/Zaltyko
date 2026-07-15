"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const toast = useToast();
  const noticeShownRef = useRef(false);
  const callbackUrl = searchParams.get("callbackUrl");
  const nextPath = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/auth/redirect";

  useEffect(() => {
    if (noticeShownRef.current) return;

    if (searchParams.get("registered") === "1") {
      noticeShownRef.current = true;
      toast.pushToast({
        title: "Revisa tu correo",
        description: "Confirma tu cuenta desde el email y luego inicia sesión para continuar.",
        variant: "success",
      });
    }

    if (searchParams.get("error") === "callback_failed") {
      noticeShownRef.current = true;
      toast.pushToast({
        title: "No pudimos completar el acceso",
        description: "Inténtalo de nuevo. Si el enlace expiró, solicita uno nuevo.",
        variant: "error",
      });
    }
  }, [searchParams, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar email antes de enviar
    if (!email.trim()) {
      toast.pushToast({
        title: "Correo requerido",
        description: "Por favor ingresa tu correo electrónico",
        variant: "error",
      });
      return;
    }
    
    if (!isValidEmail(email)) {
      toast.pushToast({
        title: "Correo inválido",
        description: "Por favor ingresa un correo electrónico válido",
        variant: "error",
      });
      return;
    }
    
    if (!password.trim()) {
      toast.pushToast({
        title: "Contraseña requerida",
        description: "Por favor ingresa tu contraseña",
        variant: "error",
      });
      return;
    }
    
    setLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        throw new Error("Email inválido");
      }
      
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        toast.pushToast({
          title: "Error al iniciar sesión",
          description: error.message,
          variant: "error",
        });
      } else {
        toast.pushToast({
          title: "Sesión iniciada",
          description: "Redirigiendo a tu espacio de trabajo...",
          variant: "success",
        });
        router.push(nextPath);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.pushToast({
        title: "Correo requerido",
        description: "Por favor ingresa tu correo electrónico",
        variant: "error",
      });
      return;
    }
    
    if (!isValidEmail(email)) {
      toast.pushToast({
        title: "Correo inválido",
        description: "Por favor ingresa un correo electrónico válido",
        variant: "error",
      });
      return;
    }
    
    setMagicLinkLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        throw new Error("Email inválido");
      }
      
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) {
        toast.pushToast({
          title: "Error al enviar enlace mágico",
          description: error.message,
          variant: "error",
        });
      } else {
        toast.pushToast({
          title: "Enlace mágico enviado",
          description: "Revisa tu correo para acceder con el enlace mágico.",
          variant: "success",
        });
      }
    } finally {
      setMagicLinkLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) {
        toast.pushToast({
          title: "Error al iniciar sesión con Google",
          description: error.message,
          variant: "error",
        });
        setGoogleLoading(false);
      }
    } catch (err) {
      toast.pushToast({
        title: "Error inesperado",
        description: "No se pudo iniciar sesión con Google",
        variant: "error",
      });
      setGoogleLoading(false);
    }
  };

  return (
    <>
      <AuthPageShell
        title="Bienvenido de nuevo"
        description="Accede para gestionar atletas, clases, pagos y comunicación desde tu academia."
        footer={
          <>
            ¿Aún no tienes cuenta?{" "}
            <Link href="/auth/register" className="font-semibold text-zaltyko-indigo hover:underline">
              Crea una cuenta
            </Link>
          </>
        }
        sideTitle="Todo tu equipo en el lugar correcto"
        sideDescription="Zaltyko lleva a cada usuario a su espacio: dirección, entrenadores, familias o administración."
        highlights={[
          "Dirección y administración entran directamente al panel de la academia.",
          "Entrenadores acceden a sus clases, atletas y tareas del día.",
          "Familias y atletas ven solo la información que necesitan.",
        ]}
      >
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando sesión...
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          <Button
            onClick={handleMagicLink}
            variant="outline"
            className="w-full border-zaltyko-primary-dark text-zaltyko-primary-dark hover:bg-zaltyko-primary-dark hover:text-white"
            disabled={magicLinkLoading || loading}
          >
            {magicLinkLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviarme un enlace mágico"
            )}
          </Button>
          <Button
            onClick={handleGoogleSignIn}
            variant="outline"
            className="w-full"
            disabled={googleLoading || loading}
          >
            {googleLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              "Entrar con Google"
            )}
          </Button>
        </div>
      </AuthPageShell>
    </>
  );
}

export default LoginForm;

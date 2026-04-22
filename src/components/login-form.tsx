"use client";
import SEO from "@/utils/seo";

import { useState } from "react";
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

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

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
          description: "Redirigiendo al dashboard...",
          variant: "success",
        });
        router.push("/dashboard");
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
      
      const { error } = await supabase.auth.signInWithOtp({ email: normalizedEmail });
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
          redirectTo: `${window.location.origin}/auth/callback`,
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
      <SEO
        title="Zaltyko · Iniciar sesión"
        description="Accede con tu correo y contraseña para gestionar tu academia."
        canonicalUrl="https://zaltyko.com"
        ogImageUrl="https://zaltyko.com/og-image.png"
        twitterHandle="zaltyko"
      />
      <AuthPageShell
        title="Bienvenido de nuevo"
        description="Accede con tu cuenta y vuelve exactamente al espacio que te corresponde dentro del producto."
        footer={
          <>
            ¿Aún no tienes cuenta?{" "}
            <Link href="/onboarding/owner" className="font-semibold text-zaltyko-primary hover:underline">
              Regístrate como owner
            </Link>
          </>
        }
        sideTitle="Un acceso más claro para cada tipo de usuario"
        sideDescription="El inicio de sesión ya está pensado para llevar a owners, coaches, atletas y tutores a su experiencia real, sin atajos ambiguos ni saltos extra."
        highlights={[
          "Owners y admins vuelven a su academia activa cuando ya están operando.",
          "Coaches aterrizan en el workspace donde trabajan a diario.",
          "Atletas y tutores se quedan fuera del shell administrativo y ven solo su experiencia útil.",
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
            className="w-full"
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

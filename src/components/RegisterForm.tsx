"use client";

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

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

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

    setLoading(true);
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/onboarding/owner`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
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
        title: "Cuenta creada",
        description: data.session
          ? "Vamos a configurar tu primera academia."
          : "Revisa tu correo para confirmar la cuenta y configurar tu primera academia.",
        variant: "success",
      });

      if (data.session) {
        router.push("/onboarding/owner");
      } else {
        router.push("/auth/login?registered=1");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell
      title="Crea tu cuenta"
      description="Crea tu acceso como responsable de academia. Después configuraremos tu primera academia paso a paso."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/auth/login" className="font-semibold text-zaltyko-primary hover:underline">
            Inicia sesión
          </Link>
        </>
      }
      sideTitle="Empieza con una cuenta clara"
      sideDescription="Primero creas tu acceso. Después te guiamos para añadir la academia, los equipos y los primeros datos."
      highlights={[
        "El registro está pensado para responsables de academia.",
        "La configuración inicial se hace en un paso guiado y fácil de revisar.",
        "Entrenadores, familias y atletas se suman después mediante invitación.",
      ]}
    >
      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            placeholder="María García"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="tu@email.com"
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
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
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
    </AuthPageShell>
  );
}

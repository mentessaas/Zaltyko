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

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RegisterRole>("owner");
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
          ? `${window.location.origin}/auth/callback?next=/auth/redirect`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            initial_role: role,
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
          ? "Vamos a llevarte a tu espacio en Zaltyko."
          : "Revisa tu correo para confirmar la cuenta y entrar a tu espacio en Zaltyko.",
        variant: "success",
      });

      if (data.session) {
        await fetch("/api/onboarding/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fullName.trim(), role }),
        });
        router.push("/auth/redirect");
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
      description="Crea tu acceso personal y elige cómo quieres usar Zaltyko."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/auth/login" className="font-semibold text-zaltyko-primary hover:underline">
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
          <Label>Tipo de cuenta</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  role === option.value
                    ? "border-zaltyko-teal bg-zaltyko-teal/10 text-zaltyko-navy"
                    : "border-border bg-background text-muted-foreground hover:border-zaltyko-teal/50"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
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

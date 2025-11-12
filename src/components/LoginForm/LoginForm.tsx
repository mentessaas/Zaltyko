"use client";

import SEO from "@/utils/seo";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error("Error al iniciar sesión:", error.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    const headers = new Headers();
    if (userId) {
      headers.set("x-user-id", userId);
    }

    try {
      const profileResponse = await fetch("/api/onboarding/profile", {
        cache: "no-store",
        headers,
      });

      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as {
          role?: string;
          tenantId?: string | null;
          profileId?: string;
          activeAcademyId?: string | null;
        };

        if (profile.role && ["super_admin", "admin", "owner"].includes(profile.role)) {
          let targetAcademyId = profile.activeAcademyId ?? null;

          if (!targetAcademyId && userId) {
            try {
              const academiesResponse = await fetch("/api/academies", {
                cache: "no-store",
                headers,
              });
              if (academiesResponse.ok) {
                const academiesData = (await academiesResponse.json()) as {
                  items?: { id: string }[];
                };
                targetAcademyId = academiesData.items?.[0]?.id ?? null;
              }
            } catch (academiesError) {
              console.error("No se pudo obtener la lista de academias.", academiesError);
            }
          }

          if (profile.role === "super_admin") {
            router.push("/super-admin");
            return;
          }

          if (profile.role === "admin") {
            router.push("/dashboard/users");
            return;
          }

          if (targetAcademyId) {
            router.push(`/app/${targetAcademyId}/dashboard`);
            return;
          }

          router.push("/dashboard");
          return;
        }
      }
    } catch (fetchError) {
      console.error("No se pudo obtener el perfil tras el login.", fetchError);
    }

    router.push("/dashboard");
  };

  return (
    <>
      <SEO
        title="Zaltyko · Iniciar sesión"
        description="Accede a tu cuenta para gestionar tu academia en Zaltyko."
        canonicalUrl="https://gymnasaas.com"
        ogImageUrl="https://gymnasaas.com/og-image.png"
        twitterHandle="gymnasaas"
      />
      <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
            Inicia sesión en tu cuenta
          </h2>
        </div>
        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <form onSubmit={handleLogin} className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
              />
            </div>
            <Button type="submit" className="w-full">
              Iniciar sesión
            </Button>
          </form>
          <p className="text-center text-sm pt-4">
            ¿Aún no tienes cuenta?{" "}
            <Link
              href="/onboarding"
              className="text-blue-500 hover:underline"
            >
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

"use client";

import SEO from "@/utils/seo";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles, Users, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        toast.pushToast({
          title: "Error al iniciar sesión",
          description: error.message,
          variant: "error",
        });
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
                // Error silencioso, continuamos con el flujo normal
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
        // Error silencioso, continuamos con el flujo normal
      }

      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO
        title="Zaltyko · Iniciar sesión"
        description="Accede a tu cuenta para gestionar tu academia en Zaltyko."
        canonicalUrl="https://zaltyko.com"
        ogImageUrl="https://zaltyko.com/og-image.png"
        twitterHandle="zaltyko"
      />
      <div className="min-h-screen w-full flex">
        {/* Left Panel - Form */}
        <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-12 bg-white/50 backdrop-blur-sm">
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-background/80 backdrop-blur px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-background hover:text-foreground hover:shadow-lg hover:border-zaltyko-primary/30"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </div>

          <div className="mx-auto w-full max-w-md">
            {/* Logo */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white font-bold shadow-lg shadow-zaltyko-primary/30">
                  <Sparkles className="h-6 w-6" />
                </div>
                <span className="font-display text-2xl font-bold bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark bg-clip-text text-transparent">
                  Zaltyko
                </span>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-3xl font-display font-bold text-zaltyko-text-main mb-2">
                Bienvenido de nuevo
              </h2>
              <p className="text-zaltyko-text-secondary">
                Inicia sesión para continuar gestionando tu academia
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-zaltyko-text-main">
                  Correo electrónico
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl border-border/60 bg-white/80 backdrop-blur focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20 transition-all"
                  placeholder="tu@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-zaltyko-text-main">
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 rounded-xl border-border/60 bg-white/80 backdrop-blur focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20 transition-all"
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark hover:from-zaltyko-primary-dark hover:to-zaltyko-primary shadow-lg shadow-zaltyko-primary/25 hover:shadow-zaltyko-primary/40 transition-all duration-300 font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Iniciar sesión
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm pt-6 text-zaltyko-text-secondary">
              ¿Aún no tienes cuenta?{" "}
              <Link
                href="/onboarding"
                className="text-zaltyko-primary font-semibold hover:underline hover:text-zaltyko-primary-dark transition-colors"
              >
                Regístrate gratis
              </Link>
            </p>
          </div>
        </div>

        {/* Right Panel - Visual */}
        <div className="hidden lg:flex flex-1 bg-gradient-to-br from-zaltyko-bg via-white to-zaltyko-primary/5 relative overflow-hidden items-center justify-center p-12">
          {/* Background Effects */}
          <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-zaltyko-primary/10 blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-zaltyko-accent-teal/10 blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-zaltyko-primary/5 to-transparent blur-[80px]" />

          <div className="relative z-10 max-w-lg">
            {/* Main Card */}
            <div className="glass-panel rounded-3xl p-8 shadow-2xl mb-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-zaltyko-primary/20 to-zaltyko-primary/5 flex items-center justify-center text-zaltyko-primary">
                  <TrendingUp className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-zaltyko-text-main">
                    Gestiona tu academia
                  </h3>
                  <p className="text-sm text-zaltyko-text-secondary">
                    Todo en un solo lugar
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 rounded-2xl bg-gradient-to-br from-zaltyko-bg to-white border border-zaltyko-border/50 p-4 flex flex-col justify-center">
                  <Users className="h-6 w-6 text-zaltyko-primary mb-2" />
                  <p className="text-xs font-semibold text-zaltyko-text-main">Atletas</p>
                  <p className="text-xs text-zaltyko-text-secondary">Gestión total</p>
                </div>
                <div className="h-24 rounded-2xl bg-gradient-to-br from-zaltyko-bg to-white border border-zaltyko-border/50 p-4 flex flex-col justify-center">
                  <TrendingUp className="h-6 w-6 text-zaltyko-accent-teal mb-2" />
                  <p className="text-xs font-semibold text-zaltyko-text-main">Estadísticas</p>
                  <p className="text-xs text-zaltyko-text-secondary">En tiempo real</p>
                </div>
              </div>
            </div>

            {/* Testimonial */}
            <div className="flex items-start gap-4 p-5 rounded-2xl bg-white/40 backdrop-blur border border-white/40 shadow-lg">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white text-sm font-bold shrink-0">
                MG
              </div>
              <div>
                <p className="text-sm font-medium text-zaltyko-text-main">
                  &quot;Zaltyko ha transformado cómo gestionamos nuestras clases. ¡Es increíble!&quot;
                </p>
                <p className="text-xs text-zaltyko-text-secondary mt-2">
                  María García · Club Gimnasia Elite
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

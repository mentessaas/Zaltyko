"use client";
import SEO from "@/utils/seo";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
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
    } else {
      router.push("/dashboard");
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      console.error("Error al enviar el enlace mágico:", error.message);
    } else {
      alert("Revisa tu correo para acceder con el enlace mágico.");
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error("Error al iniciar sesión con Google:", error.message);
    }
  };

  return (
    <>
      <SEO
        title="Zaltyko · Iniciar sesión"
        description="Accede con tu correo y contraseña para gestionar tu academia."
        canonicalUrl="https://gymnasaas.com"
        ogImageUrl="https://gymnasaas.com/og-image.png"
        twitterHandle="gymnasaas"
      />
      <div className="space-y-6">
        <form onSubmit={handleLogin} className="space-y-4">
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
        <div className="flex flex-col space-y-4">
          <Button
            onClick={handleMagicLink}
            variant="outline"
            className="w-full"
          >
            Enviarme un enlace mágico
          </Button>
          <Button
            onClick={handleGoogleSignIn}
            variant="outline"
            className="w-full"
          >
            Inicia sesión con Google
          </Button>
        </div>
        <p className="text-center text-sm">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/auth/register" className="text-blue-500 hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </>
  );
}

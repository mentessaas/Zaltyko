"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Send, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Create Supabase client for client-side
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Listing {
  id: string;
  title: string;
  category: string;
  description: string;
  location: {
    city: string;
    province?: string;
    country: string;
  };
  jobType: string;
  salary?: {
    min?: number;
    max?: number;
    type: string;
    currency: string;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  coach: "Entrenador",
  assistant_coach: "Asistente de Entrenador",
  administrative: "Administrativo",
  physiotherapist: "Fisioterapeuta",
  psychologist: "Psicólogo Deportivo",
  other: "Otro",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Jornada Completa",
  part_time: "Media Jornada",
  internship: "Prácticas",
};

export default function ApplyPage() {
  const router = useRouter();
  const params = useParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [listingLoading, setListingLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    message: "",
    resumeUrl: "",
  });

  const listingId = params.id as string;

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (!user) {
        // Redirect to login with callback
        router.push(`/auth/login?callbackUrl=/empleo/${listingId}/aplicar`);
        return;
      }

      // Fetch listing details
      const res = await fetch(`/api/empleo/${listingId}`);
      const data = await res.json();
      if (data.item) {
        setListing(data.item);
      }
    } catch (err) {
      console.error("Error checking user:", err);
    } finally {
      setLoading(false);
      setListingLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/empleo/${listingId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: formData.message,
          resumeUrl: formData.resumeUrl || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "AUTH_REQUIRED") {
          router.push(`/auth/login?callbackUrl=/empleo/${listingId}/aplicar`);
          return;
        }
        if (data.error === "ALREADY_APPLIED") {
          setError("Ya has aplicado a este puesto anteriormente");
          return;
        }
        throw new Error(data.message || "Error al enviar la solicitud");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Error al enviar la solicitud");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || listingLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Empleo no encontrado</h2>
            <p className="text-muted-foreground mb-4">
              Este empleo no existe o ya no está disponible.
            </p>
            <Link href="/empleo">
              <Button>Volver a la bolsa de empleo</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Solicitud enviada!</h2>
            <p className="text-muted-foreground mb-4">
              Tu solicitud para el puesto de <strong>{listing.title}</strong> ha sido enviada correctamente.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              La empresa revisará tu solicitud y te contactará si estás interesado.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/empleo">
                <Button variant="outline">Ver más empleos</Button>
              </Link>
              <Link href={`/empleo/${listingId}`}>
                <Button>Ver detalles del empleo</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href={`/empleo/${listingId}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver al empleo
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Aplicar a: {listing.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                    {CATEGORY_LABELS[listing.category] || listing.category}
                  </span>
                  <span className="px-2 py-1 text-xs font-medium bg-secondary/10 text-secondary-foreground rounded-full">
                    {JOB_TYPE_LABELS[listing.jobType] || listing.jobType}
                  </span>
                </div>
                {listing.location && (
                  <p className="text-sm text-muted-foreground">
                    📍 {listing.location.city}, {listing.location.province || listing.location.country}
                  </p>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <Label htmlFor="resumeUrl">URL de tu CV (LinkedIn, portafolio, etc.)</Label>
                  <Input
                    id="resumeUrl"
                    type="url"
                    value={formData.resumeUrl}
                    onChange={(e) => setFormData({ ...formData, resumeUrl: e.target.value })}
                    placeholder="https://linkedin.com/in/tu-perfil"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enlace a tu perfil de LinkedIn, Currículum online, o portafolio
                  </p>
                </div>

                <div>
                  <Label htmlFor="message">Carta de presentación</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Cuentanos por qué te interesa este puesto y qué te hace un buen candidato..."
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Máximo 2000 caracteres
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    "Enviando..."
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar solicitud
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información del puesto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Categoría: </span>
                <span className="font-medium">{CATEGORY_LABELS[listing.category] || listing.category}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Tipo: </span>
                <span className="font-medium">{JOB_TYPE_LABELS[listing.jobType] || listing.jobType}</span>
              </p>
              {listing.salary && (
                <p>
                  <span className="text-muted-foreground">Salario: </span>
                  <span className="font-medium">
                    {listing.salary.type === "range" && listing.salary.min && listing.salary.max
                      ? `${listing.salary.min}€ - ${listing.salary.max}€/mes`
                      : listing.salary.type === "fixed" && listing.salary.min
                      ? `${listing.salary.min}€/mes`
                      : "A consultar"}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
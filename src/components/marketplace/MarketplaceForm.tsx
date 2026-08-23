"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-provider";
import { logger } from "@/lib/logger";

const CATEGORIES = [
  { value: "equipment", label: "Equipamiento" },
  { value: "clothing", label: "Ropa" },
  { value: "supplements", label: "Suplementos" },
  { value: "books", label: "Libros" },
  { value: "particular_training", label: "Clases particulares" },
  { value: "personal_training", label: "Entrenamiento personal" },
  { value: "clinics", label: "Clínicas" },
  { value: "arbitration", label: "Arbitraje" },
  { value: "physiotherapy", label: "Fisioterapia" },
  { value: "photography", label: "Fotografía" },
  { value: "other", label: "Otro" },
];

// PV-6: al menos un canal de contacto obligatorio. Si los tres llegan
// vacíos, el cliente bloquea el envío y la API responde 400 con el
// mismo mensaje (ver `route.ts`). El default `contact` para priceType
// hace obligatorio que el contacto exista, así que el caso "A convenir"
// sin teléfono cae al guard.
const CONTACT_REQUIRED_MSG =
  "Necesitamos al menos una forma de que te contacten.";

interface MarketplaceFormProps {
  onSuccess?: () => void;
}

interface FormErrors {
  category?: string;
  title?: string;
  description?: string;
  contact?: string;
  city?: string;
  // Errores a nivel de formulario (no atados a un campo concreto):
  // por ejemplo un 403 de permisos.
  form?: { title: string; description: React.ReactNode; variant: "error" | "warning" };
}

export function MarketplaceForm({ onSuccess }: MarketplaceFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
    type: "product",
    category: "",
    title: "",
    description: "",
    price: "",
    priceType: "contact",
    contactWhatsapp: "",
    contactEmail: "",
    contactPhone: "",
    country: "España",
    province: "",
    city: "",
  });

  // PV-6 + PV-4: validación cliente que devuelve errores anclados al
  // campo, no al toast. Devuelve un objeto FormErrors listo para
  // pintar bajo el input correspondiente.
  function validateClient(): FormErrors {
    const e: FormErrors = {};
    if (!formData.category) {
      e.category = "Selecciona una categoría.";
    }
    if (!formData.title.trim() || formData.title.trim().length < 3) {
      e.title = "El título debe tener al menos 3 caracteres.";
    }
    if (!formData.city.trim()) {
      e.city = "Indica la ciudad donde ofreces el producto o servicio.";
    }
    const hasContact =
      formData.contactWhatsapp.trim().length > 0 ||
      formData.contactEmail.trim().length > 0 ||
      formData.contactPhone.trim().length > 0;
    if (!hasContact) {
      e.contact = CONTACT_REQUIRED_MSG;
    }
    return e;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // PV-4: la validación de cliente muestra mensajes anclados al campo,
    // no en toast genérico.
    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      // Si solo es falta de contacto, toast para que se note arriba del
      // formulario (el error anclado queda en su sección).
      if (clientErrors.contact && !clientErrors.category && !clientErrors.title && !clientErrors.city) {
        toast.pushToast({
          title: "Falta información de contacto",
          description: CONTACT_REQUIRED_MSG,
          variant: "error",
        });
      }
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      // NO enviamos userId ni sellerType: ambos los deriva el servidor
      // desde la sesión y el rol del perfil (ver ZAL-496 / PV-3 de la
      // auditoría ZAL-427). Mandarlos desde cliente abriría un IDOR y
      // permitiría falsear el tipo de vendedor.
      const response = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formData.type,
          category: formData.category,
          title: formData.title,
          description: formData.description,
          priceCents: formData.price ? Math.round(parseFloat(formData.price) * 100) : null,
          priceType: formData.priceType,
          contact: {
            whatsapp: formData.contactWhatsapp || undefined,
            email: formData.contactEmail || undefined,
            phone: formData.contactPhone || undefined,
          },
          location: formData.city ? {
            country: formData.country,
            province: formData.province,
            city: formData.city,
          } : undefined,
        }),
      });

      if (response.ok) {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/marketplace");
        }
        return;
      }

      // PV-4: el copy se mapea por código/status, no por
      // `error.message || fallback`. El 403 TENANT_MISSING llega sin
      // `message` desde authz.ts:278 y antes se mostraba como error de
      // datos.
      const body = await safeJson(response);
      const details = body?.details;
      const field =
        details && typeof details === "object" && "field" in details &&
        (details as { field?: unknown }).field;
      if (response.status === 400 && field === "category") {
        const message = "Falta la categoría.";
        setErrors({ category: message });
        toast.pushToast({ title: "Falta información", description: message, variant: "error" });
        return;
      }
      if (response.status === 400 && field === "contact") {
        setErrors({ contact: CONTACT_REQUIRED_MSG });
        toast.pushToast({ title: "Falta información", description: CONTACT_REQUIRED_MSG, variant: "error" });
        return;
      }
      const copy = copyForPublishError(response.status, body);
      setErrors({ form: copy });
      toast.pushToast({
        title: copy.title,
        description:
          typeof copy.description === "string"
            ? copy.description
            : "Revisa los detalles bajo el formulario.",
        variant: copy.variant,
      });
    } catch (error) {
      logger.error("Marketplace publish", error);
      setErrors({
        form: {
          title: "No pudimos publicar tu anuncio",
          description:
            "Vuelve a intentarlo en unos segundos. Si el problema persiste, contáctanos.",
          variant: "error",
        },
      });
      toast.pushToast({
        title: "No pudimos publicar tu anuncio",
        description: "Vuelve a intentarlo en unos segundos.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {errors.form && (
        // Banner de error a nivel formulario (PV-4). Solo aparece para
        // errores que NO son de campo: permisos, servidor. Los errores
        // de validación van anclados a su input.
        <div
          role="alert"
          className={
            "rounded-md border p-3 text-sm " +
            (errors.form.variant === "warning"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-red-300 bg-red-50 text-red-900")
          }
        >
          <p className="font-semibold">{errors.form.title}</p>
          <div className="mt-1">{errors.form.description}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="type">Tipo</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="product">Producto</SelectItem>
              <SelectItem value="service">Servicio</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="category">Categoría *</Label>
          <Select
            value={formData.category}
            onValueChange={(v) => {
              setFormData({ ...formData, category: v });
              if (errors.category) setErrors((e) => ({ ...e, category: undefined }));
            }}
          >
            <SelectTrigger
              aria-invalid={!!errors.category}
              className={errors.category ? "border-red-500 focus:ring-red-500" : undefined}
            >
              <SelectValue placeholder="Selecciona categoría" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-xs text-red-600 mt-1" role="alert">{errors.category}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="title">Título *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => {
            setFormData({ ...formData, title: e.target.value });
            if (errors.title) setErrors((er) => ({ ...er, title: undefined }));
          }}
          placeholder="Ej: Colchonetas de gimnasia profesional"
          aria-invalid={!!errors.title}
          className={errors.title ? "border-red-500 focus-visible:ring-red-500" : undefined}
          required
        />
        {errors.title && (
          <p className="text-xs text-red-600 mt-1" role="alert">{errors.title}</p>
        )}
      </div>

      <div>
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe tu producto o servicio..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="price">Precio (€)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder="0.00"
          />
        </div>

        <div>
          <Label htmlFor="priceType">Tipo de precio</Label>
          <Select value={formData.priceType} onValueChange={(v) => setFormData({ ...formData, priceType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fijo</SelectItem>
              <SelectItem value="negotiable">Negociable</SelectItem>
              <SelectItem value="contact">Consultar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contacto *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="contactWhatsapp">WhatsApp</Label>
              <Input
                id="contactWhatsapp"
                value={formData.contactWhatsapp}
                onChange={(e) => {
                  setFormData({ ...formData, contactWhatsapp: e.target.value });
                  if (errors.contact) setErrors((er) => ({ ...er, contact: undefined }));
                }}
                placeholder="+34 600 000 000"
                aria-invalid={!!errors.contact}
              />
            </div>
            <div>
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => {
                  setFormData({ ...formData, contactEmail: e.target.value });
                  if (errors.contact) setErrors((er) => ({ ...er, contact: undefined }));
                }}
                placeholder="email@ejemplo.com"
                aria-invalid={!!errors.contact}
              />
            </div>
            <div>
              <Label htmlFor="contactPhone">Teléfono</Label>
              <Input
                id="contactPhone"
                value={formData.contactPhone}
                onChange={(e) => {
                  setFormData({ ...formData, contactPhone: e.target.value });
                  if (errors.contact) setErrors((er) => ({ ...er, contact: undefined }));
                }}
                placeholder="+34 600 000 000"
                aria-invalid={!!errors.contact}
              />
            </div>
          </div>
          {errors.contact && (
            <p className="text-xs text-red-600" role="alert">{errors.contact}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Necesitamos al menos una forma de que te contacten.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ubicación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="province">Provincia</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="city">Ciudad *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => {
                  setFormData({ ...formData, city: e.target.value });
                  if (errors.city) setErrors((er) => ({ ...er, city: undefined }));
                }}
                aria-invalid={!!errors.city}
                className={errors.city ? "border-red-500 focus-visible:ring-red-500" : undefined}
                required
              />
              {errors.city && (
                <p className="text-xs text-red-600 mt-1" role="alert">{errors.city}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creando..." : "Publicar"}
      </Button>
    </form>
  );
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// PV-4: el código que llega del backend determina el copy, no el
// `message` (que en 403 TENANT_MISSING viene vacío desde authz.ts).
function copyForPublishError(
  status: number,
  body: Record<string, unknown> | null
): NonNullable<FormErrors["form"]> {
  const code = typeof body?.error === "string" ? body.error : (body?.code as string | undefined);

  if (status === 401) {
    return {
      title: "Tu sesión ha caducado",
      description: (
        <span>
          Inicia sesión de nuevo y vuelve a intentarlo.{" "}
          <Link href="/login" className="underline">Ir al login</Link>
        </span>
      ),
      variant: "warning",
    };
  }

  if (status === 403) {
    // TENANT_MISSING / FORBIDDEN: el problema es de permisos del
    // proveedor, no de los datos. Antes se mostraba como
    // "Revisa los datos e inténtalo de nuevo" porque `message` venía
    // vacío y caía al fallback.
    return {
      title: "Tu cuenta de proveedor todavía no puede publicar",
      description: (
        <span>
          Escríbenos y lo activamos.{" "}
          <Link href="/contact?type=support" className="underline">Abrir formulario de contacto</Link>
        </span>
      ),
      variant: "warning",
    };
  }

  if (status === 400 || code === "VALIDATION_ERROR") {
    return {
      title: "Faltan datos en el formulario",
      description: "Revisa los campos marcados en rojo y vuelve a intentarlo.",
      variant: "error",
    };
  }

  return {
    title: "No pudimos publicar tu anuncio",
    description: "No pudimos publicar tu anuncio. Vuelve a intentarlo en unos segundos.",
    variant: "error",
  };
}

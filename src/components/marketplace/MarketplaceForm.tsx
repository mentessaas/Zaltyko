"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

interface MarketplaceFormProps {
  userId?: string;
  sellerType?: string;
  onSuccess?: () => void;
}

export function MarketplaceForm({ userId, sellerType = "external", onSuccess }: MarketplaceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sellerType,
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
      } else {
        const error = await response.json();
        alert(error.message || "Error al crear el listing");
      }
    } catch (error) {
      console.error(error);
      alert("Error al crear el listing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
          <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })} required>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona categoría" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="title">Título *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Ej: Colchonetas de gimnasia profesional"
          required
        />
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
          <CardTitle className="text-lg">Contacto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="contactWhatsapp">WhatsApp</Label>
              <Input
                id="contactWhatsapp"
                value={formData.contactWhatsapp}
                onChange={(e) => setFormData({ ...formData, contactWhatsapp: e.target.value })}
                placeholder="+34 600 000 000"
              />
            </div>
            <div>
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <Label htmlFor="contactPhone">Teléfono</Label>
              <Input
                id="contactPhone"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+34 600 000 000"
              />
            </div>
          </div>
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
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
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

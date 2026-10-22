"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/ui/toast-provider";
import { logger } from "@/lib/logger";

interface PhotoGalleryProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  academyId: string;
}

export function PhotoGallery({ photos, onChange, academyId }: PhotoGalleryProps) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (photos.length >= 10) {
      toast.pushToast({ title: "Límite alcanzado", description: "Puedes añadir hasta 10 fotos a tu galería.", variant: "error" });
      e.target.value = "";
      return;
    }
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      toast.pushToast({ title: "Formato no compatible", description: "Usa una imagen JPG, PNG o WebP.", variant: "error" });
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.pushToast({ title: "Imagen demasiado grande", description: "La imagen no puede superar 5 MB.", variant: "error" });
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      // Upload a Supabase Storage mediante API
      const formData = new FormData();
      formData.append("file", file);
      formData.append("academyId", academyId);
      formData.append("folder", "coach-gallery");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? payload?.data?.message ?? "No se pudo subir la imagen");
      }

      const payload = await response.json();
      const url = payload?.data?.url ?? payload?.url;
      if (!url) throw new Error("El servidor no devolvió la URL de la imagen");
      onChange([...photos, url]);
    } catch (error) {
      logger.error("Error uploading photo:", error);
      toast.pushToast({
        title: "No se pudo subir la imagen",
        description: "Revisa el archivo e inténtalo de nuevo.",
        variant: "error",
      });
    } finally {
      setUploading(false);
      // Permite volver a elegir el mismo archivo después de quitarlo o de un error.
      e.target.value = "";
    }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        Galería de Fotos
      </Label>
      <div className="grid gap-4 md:grid-cols-3">
        {photos.map((photo, index) => (
          <Card key={index} className="relative overflow-hidden">
            <div className="relative aspect-square">
              <Image
                src={photo}
                alt={`Foto ${index + 1}`}
                fill
                className="object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute right-2 top-2"
                onClick={() => removePhoto(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
        <Card className="flex items-center justify-center border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-6">
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <Label htmlFor="photo-upload" className="cursor-pointer">
              <span className="text-sm text-muted-foreground">Añadir foto</span>
              <Input
                id="photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </Label>
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Puedes añadir hasta 10 fotos a tu galería. Las fotos deben ser en formato JPG, PNG o WebP.
      </p>
    </div>
  );
}

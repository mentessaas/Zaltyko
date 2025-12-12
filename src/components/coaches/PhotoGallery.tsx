"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import Image from "next/image";

interface PhotoGalleryProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  academyId: string;
}

export function PhotoGallery({ photos, onChange, academyId }: PhotoGalleryProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // TODO: Implementar upload a Supabase Storage
      // Por ahora, solo simulamos la URL
      const formData = new FormData();
      formData.append("file", file);
      formData.append("academyId", academyId);
      formData.append("folder", "coach-gallery");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Error al subir la imagen");
      }

      const data = await response.json();
      onChange([...photos, data.url]);
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Error al subir la imagen");
    } finally {
      setUploading(false);
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
        Puedes añadir hasta 10 fotos a tu galería. Las fotos deben ser en formato JPG o PNG.
      </p>
    </div>
  );
}


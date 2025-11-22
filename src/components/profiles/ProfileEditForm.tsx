"use client";

import { useState, FormEvent, useRef } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type User } from "@supabase/supabase-js";
import { type ProfileRow } from "@/lib/authz";
import { Camera, Upload, X } from "lucide-react";
import { validatePhoneNumber, normalizePhoneNumber, formatPhoneNumber } from "@/lib/validation/phone";

interface ProfileEditFormProps {
  user: User | null;
  profile: ProfileRow | null;
  onUpdated?: (updated: { 
    name: string | null; 
    email: string | null;
    phone: string | null;
    bio: string | null;
    photoUrl: string | null;
  }) => void;
  onCancel?: () => void;
}

export function ProfileEditForm({ user, profile, onUpdated, onCancel }: ProfileEditFormProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const initials = (name || user?.email || "U").slice(0, 2).toUpperCase();

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (value.trim()) {
      const validation = validatePhoneNumber(value);
      if (!validation.valid) {
        setPhoneError(validation.error || "Teléfono inválido");
      } else {
        setPhoneError(null);
        if (validation.formatted) {
          setPhone(validation.formatted);
        }
      }
    } else {
      setPhoneError(null);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/upload-photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Error al subir la imagen");
      }

      const { url } = await response.json();
      setPhotoUrl(url);
    } catch (err: any) {
      setError(err.message || "Error al subir la imagen");
    } finally {
      setIsUploadingPhoto(false);
      // Reset input
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const updates: { 
        name?: string; 
        email?: string;
        phone?: string | null;
        bio?: string | null;
        photoUrl?: string | null;
      } = {};
      
      if (name.trim() !== (profile?.name ?? "")) {
        updates.name = name.trim();
      }
      
      if (email.trim() !== (user?.email ?? "")) {
        updates.email = email.trim();
      }

      // Validar teléfono antes de enviar
      if (phone.trim()) {
        const validation = validatePhoneNumber(phone);
        if (!validation.valid) {
          setError(validation.error || "Teléfono inválido");
          setIsSubmitting(false);
          return;
        }
        const normalizedPhone = normalizePhoneNumber(phone);
        const currentPhone = profile?.phone ?? null;
        if (normalizedPhone !== currentPhone) {
          updates.phone = normalizedPhone;
        }
      } else {
        const currentPhone = profile?.phone ?? null;
        if (currentPhone !== null) {
          updates.phone = null;
        }
      }

      const currentBio = profile?.bio ?? null;
      const newBio = bio.trim() || null;
      if (newBio !== currentBio) {
        updates.bio = newBio;
      }

      const currentPhotoUrl = profile?.photoUrl ?? null;
      const newPhotoUrl = photoUrl.trim() || null;
      if (newPhotoUrl !== currentPhotoUrl) {
        updates.photoUrl = newPhotoUrl;
      }

      if (Object.keys(updates).length === 0) {
        setError("No hay cambios para guardar");
        setIsSubmitting(false);
        return;
      }

      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Error al actualizar el perfil");
      }

      const updated = await response.json();
      setSuccess(true);
      
      if (onUpdated) {
        onUpdated({
          name: updated.name,
          email: updated.email,
          phone: updated.phone ?? null,
          bio: updated.bio ?? null,
          photoUrl: updated.photoUrl ?? null,
        });
      }

      // Reset success message after 2 seconds
      setTimeout(() => {
        setSuccess(false);
        if (onCancel) {
          onCancel();
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Error al actualizar el perfil");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Foto de perfil */}
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar className="h-20 w-20">
            <AvatarImage src={photoUrl || undefined} alt={name || "Usuario"} />
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          {photoUrl && (
            <button
              type="button"
              onClick={() => setPhotoUrl("")}
              className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-white hover:bg-destructive/90"
              disabled={isSubmitting || isUploadingPhoto}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Label>Foto de perfil</Label>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={isSubmitting || isUploadingPhoto}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting || isUploadingPhoto}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isUploadingPhoto ? "Subiendo..." : "Subir foto"}
            </Button>
            <Input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="O pega una URL de imagen"
              disabled={isSubmitting || isUploadingPhoto}
              className="flex-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sube una imagen (JPG, PNG, WebP, máx. 5MB) o usa una URL. La imagen se redimensionará automáticamente.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre completo</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre completo"
            disabled={isSubmitting}
            required
          />
          <p className="text-xs text-muted-foreground">
            Este nombre aparecerá en tu perfil y en las comunicaciones.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            disabled={isSubmitting}
            required
          />
          {email.trim() !== (user?.email ?? "") && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Al cambiar tu correo, recibirás un email de verificación en la nueva dirección. Debes verificar el nuevo correo para poder iniciar sesión.
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Este correo se utilizará para iniciar sesión y recibir notificaciones.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono (opcional)</Label>
          <Input
            id="phone"
            type="tel"
            value={formatPhoneNumber(phone)}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="+34 600 000 000"
            disabled={isSubmitting}
            className={phoneError ? "border-destructive" : ""}
          />
          {phoneError ? (
            <p className="text-xs text-destructive">{phoneError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Incluye el código de país (ej: +34 para España, +1 para USA, +52 para México).
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Biografía (opcional)</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Cuéntanos sobre ti..."
            rows={4}
            disabled={isSubmitting}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            {bio.length}/1000 caracteres. Una breve descripción sobre ti.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Perfil actualizado correctamente
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}


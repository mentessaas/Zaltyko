"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileEditForm } from "./ProfileEditForm";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { UserPreferencesForm } from "./UserPreferencesForm";
import { type User } from "@supabase/supabase-js";
import { type ProfileRow } from "@/lib/authz";
import { User as UserIcon, Lock, Settings } from "lucide-react";

interface ProfileTabsProps {
  user: User | null;
  profile: ProfileRow | null;
  onProfileUpdated?: () => void;
}

export function ProfileTabs({ user, profile, onProfileUpdated }: ProfileTabsProps) {
  const [preferences, setPreferences] = useState<any>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(true);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch("/api/profile/preferences");
        if (response.ok) {
          const data = await response.json();
          setPreferences(data);
        }
      } catch (error) {
        console.error("Error fetching preferences:", error);
      } finally {
        setLoadingPreferences(false);
      }
    }

    if (user) {
      fetchPreferences();
    }
  }, [user]);

  return (
    <Tabs defaultValue="information" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="information" className="flex items-center gap-2">
          <UserIcon className="h-4 w-4" />
          Información
        </TabsTrigger>
        <TabsTrigger value="security" className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Seguridad
        </TabsTrigger>
        <TabsTrigger value="preferences" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Preferencias
        </TabsTrigger>
      </TabsList>

      <TabsContent value="information" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Información personal</CardTitle>
            <CardDescription>
              Actualiza tu información personal, foto de perfil y datos de contacto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileEditForm
              user={user}
              profile={profile}
              onUpdated={() => {
                if (onProfileUpdated) {
                  onProfileUpdated();
                }
              }}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="security" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Seguridad</CardTitle>
            <CardDescription>
              Gestiona tu contraseña y la seguridad de tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="preferences" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Preferencias</CardTitle>
            <CardDescription>
              Configura tu zona horaria, idioma y preferencias de notificaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPreferences ? (
              <p className="text-sm text-muted-foreground">Cargando preferencias...</p>
            ) : (
              <UserPreferencesForm
                userId={user?.id ?? ""}
                initialPreferences={preferences}
                onUpdated={() => {
                  // Recargar preferencias
                  fetch("/api/profile/preferences")
                    .then((res) => res.json())
                    .then((data) => setPreferences(data))
                    .catch(console.error);
                }}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}


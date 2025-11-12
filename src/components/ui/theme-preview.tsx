"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function ThemePreview() {
  return (
    <div className="min-h-screen bg-zaltyko-neutral-light p-8">
      <div className="mx-auto max-w-6xl space-y-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-zaltyko-primary-dark">
            Zaltyko Design System Preview
          </h1>
          <p className="mt-2 font-sans text-lg text-zaltyko-neutral-dark/70">
            Vista previa de todos los componentes base con el nuevo branding
          </p>
        </div>

        {/* Color Palette */}
        <Card>
          <CardHeader>
            <CardTitle>Paleta de Colores</CardTitle>
            <CardDescription>Colores principales del sistema de diseño Zaltyko</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-zaltyko-primary"></div>
                <p className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                  Primary
                </p>
                <p className="font-sans text-xs text-zaltyko-neutral-dark/70">#0D47A1</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-zaltyko-primary-light"></div>
                <p className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                  Primary Light
                </p>
                <p className="font-sans text-xs text-zaltyko-neutral-dark/70">#42A5F5</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-zaltyko-accent"></div>
                <p className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                  Accent
                </p>
                <p className="font-sans text-xs text-zaltyko-neutral-dark/70">#FBC02D</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-zaltyko-accent-light"></div>
                <p className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                  Accent Light
                </p>
                <p className="font-sans text-xs text-zaltyko-neutral-dark/70">#FFE082</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-zaltyko-neutral-light border-2 border-zaltyko-neutral-dark/20"></div>
                <p className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                  Neutral Light
                </p>
                <p className="font-sans text-xs text-zaltyko-neutral-dark/70">#F5F7FA</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-zaltyko-neutral-dark"></div>
                <p className="font-display text-sm font-semibold text-white">
                  Neutral Dark
                </p>
                <p className="font-sans text-xs text-white/70">#1E1E1E</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Botones</CardTitle>
            <CardDescription>Todas las variantes y tamaños de botones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-display text-lg font-semibold text-zaltyko-primary-dark">
                Variantes
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-display text-lg font-semibold text-zaltyko-primary-dark">
                Tamaños
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">🚀</Button>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-display text-lg font-semibold text-zaltyko-primary-dark">
                Estados
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button disabled>Disabled</Button>
                <Button variant="default">Hover me</Button>
                <Button variant="secondary">Active</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards */}
        <Card>
          <CardHeader>
            <CardTitle>Tarjetas</CardTitle>
            <CardDescription>Componente Card con diferentes contenidos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Tarjeta Simple</CardTitle>
                  <CardDescription>Descripción de la tarjeta</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-sans text-sm text-zaltyko-neutral-dark/70">
                    Contenido de ejemplo para mostrar cómo se ve el texto dentro de una tarjeta.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm">
                    Acción
                  </Button>
                </CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tarjeta con Badge</CardTitle>
                  <CardDescription>Ejemplo con badges</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="active">Activo</Badge>
                    <Badge variant="success">Éxito</Badge>
                    <Badge variant="pending">Pendiente</Badge>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tarjeta Completa</CardTitle>
                  <CardDescription>Con todos los elementos</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-sans text-sm text-zaltyko-neutral-dark/70">
                    Esta tarjeta muestra todos los componentes disponibles.
                  </p>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="ghost" size="sm">
                    Cancelar
                  </Button>
                  <Button variant="default" size="sm">
                    Confirmar
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Campos de formulario con diferentes estados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                Input Normal
              </label>
              <Input placeholder="Escribe algo aquí..." />
            </div>
            <div className="space-y-2">
              <label className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                Input con Valor
              </label>
              <Input value="Texto de ejemplo" readOnly />
            </div>
            <div className="space-y-2">
              <label className="font-display text-sm font-semibold text-zaltyko-primary-dark">
                Input Deshabilitado
              </label>
              <Input placeholder="Campo deshabilitado" disabled />
            </div>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
            <CardDescription>Todas las variantes de badges</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Badge variant="default">Default</Badge>
              <Badge variant="active">Activo</Badge>
              <Badge variant="pending">Pendiente</Badge>
              <Badge variant="success">Éxito</Badge>
              <Badge variant="error">Error</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Typography */}
        <Card>
          <CardHeader>
            <CardTitle>Tipografía</CardTitle>
            <CardDescription>Fuentes Poppins (display) e Inter (sans)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h1 className="font-display text-4xl font-bold text-zaltyko-primary-dark">
                Heading 1 - Poppins Bold
              </h1>
              <h2 className="font-display text-3xl font-semibold text-zaltyko-primary-dark">
                Heading 2 - Poppins Semibold
              </h2>
              <h3 className="font-display text-2xl font-semibold text-zaltyko-primary-dark">
                Heading 3 - Poppins Semibold
              </h3>
              <p className="font-sans text-base text-zaltyko-neutral-dark/70">
                Body text - Inter Regular. Este es un ejemplo de texto largo que muestra cómo se
                ve el contenido principal usando la fuente Inter. Es legible y profesional.
              </p>
              <p className="font-sans text-sm text-zaltyko-neutral-dark/70">
                Small text - Inter Regular. Texto más pequeño para descripciones y detalles
                secundarios.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


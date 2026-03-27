import { NextResponse } from "next/server";

const LLMS_CONTENT = `
# Zaltyko - Software para Gestión de Academias de Gimnasia

## Descripción General

Zaltyko es una plataforma SaaS especializada en la gestión integral de academias de gimnasia (artística, rítmica, acrobática y trampolín). La plataforma cubre gestión de atletas, clases, horarios, facturación, eventos y comunicación.

## Estructura del Sitio

### Páginas Principales
- / - Homepage con información general
- /pricing - Planes y precios
- /academias - Directorio de academias
- /features - Funcionalidades detalladas

### Cluster Pages (Contenido Localizado)
El sitio incluye 52 páginas de cluster específicas por país y modalidad:

**España:**
- /es/gimnasia-artistica/espana - Gimnasia Artística en España
- /es/gimnasia-ritmica/espana - Gimnasia Rítmica en España
- /es/gimnasia-acrobatica/espana - Gimnasia Acrobática en España
- /es/trampolin/espana - Trampolín en España

**México:**
- /es/gimnasia-artistica/mexico
- /es/gimnasia-ritmica/mexico
- /es/gimnasia-acrobatica/mexico
- /es/trampolin/mexico

**Argentina, Colombia, Chile, Perú:**
- mismas modalidades para cada país

**Contenido en Inglés:**
- /en/* - Versiones en inglés de todas las páginas

### Módulos de la Plataforma
- /modules/gestion-atletas - Gestión de atletas federados
- /modules/clases-horarios - Programación de clases
- /modules/eventos-competiciones - Inscripciones a competiciones
- /modules/pagos-administracion - Facturación y cobros
- /modules/comunicacion - Mensajería y notificaciones

### Onboarding
- /onboarding - Registro de nuevas academias
- /onboarding/athlete - Registro como atleta
- /onboarding/coach - Registro como entrenador

## Datos de Contacto

- Email: hola@zaltyko.com
- Website: https://zaltyko.com
- Social: Twitter (@zaltyko), LinkedIn (company/zaltyko), Instagram (@zaltyko)

## Localización

- Idiomas soportados: Español (es), Inglés (en)
- Divisas: EUR (Europa), USD (Latinoamérica)
- Federaciones deportivas integradas: RFEG (España), FMGM (México), CGG (Argentina), FCG (Colombia), FGCh (Chile), FPG (Perú)

## Categorías de Atletas Soportadas

- Gimnasia Artística: Base, Alevín, Infantil, Junior, Senior, Absoluta
- Gimnasia Rítmica: Base, Preinfantil, Infantil, Juvenil, Senior
- Gimnasia Acrobática: Base, A, B, C, D
- Trampolín: Base, Nivel 1-5, Élite
`;

export async function GET() {
  return new NextResponse(LLMS_CONTENT, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

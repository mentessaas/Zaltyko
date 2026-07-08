import { NextResponse } from "next/server";

const LLMS_CONTENT = `
# Zaltyko - Software para Gestión de Academias de Gimnasia

## Descripción General

Zaltyko es una plataforma especializada en la dirección de academias de gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. La plataforma cubre gestión de gimnastas, grupos, horarios, cobros, eventos, familias y seguimiento técnico.

## Estructura del Sitio

### Páginas Principales
- / - Homepage con información general
- /pricing - Planes y precios
- /academias - Directorio de academias
- /features - Funcionalidades detalladas

### Cluster Pages (Contenido Localizado)
El sitio incluye páginas de cluster específicas por país y modalidad para artística y rítmica:

**España:**
- /es/gimnasia-artistica/espana - Gimnasia Artística en España
- /es/gimnasia-ritmica/espana - Gimnasia Rítmica en España

**México:**
- /es/gimnasia-artistica/mexico
- /es/gimnasia-ritmica/mexico

**Argentina, Colombia, Chile, Perú:**
- gimnasia artística y gimnasia rítmica para cada país

**Contenido en Inglés:**
- /en/* - Versiones en inglés de todas las páginas

### Módulos de la Plataforma
- /modules/gestion-atletas - Gestión de gimnastas federadas y federados
- /modules/clases-horarios - Programación de clases
- /modules/eventos-competiciones - Inscripciones a competiciones
- /modules/pagos-administracion - Cobros y cuotas
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

## Categorías De Gimnastas Soportadas

- Gimnasia Artística: Base, Alevín, Infantil, Junior, Senior, Absoluta
- Gimnasia Rítmica: Base, Preinfantil, Infantil, Juvenil, Senior
`;

export async function GET() {
  return new NextResponse(LLMS_CONTENT, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

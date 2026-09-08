import { NextResponse } from "next/server";

const BASE_URL = "https://zaltyko.com";

const LLMS_CONTENT = `
# Zaltyko - Software para Gestión de Academias de Gimnasia

> Zaltyko es una plataforma especializada en la dirección de academias de gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. La plataforma cubre gestión de gimnastas, grupos, horarios, cobros, eventos, familias y seguimiento técnico.

## Descripción General

Zaltyko es una plataforma especializada en la dirección de academias de gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. La plataforma cubre gestión de gimnastas, grupos, horarios, cobros, eventos, familias y seguimiento técnico.

## Estructura del Sitio

### Páginas Principales

- [Inicio](${BASE_URL}/) — Homepage con información general
- [Planes y precios](${BASE_URL}/pricing) — Planes y precios
- [Directorio de Academias](${BASE_URL}/academias) — Academias que usan Zaltyko
- [Funcionalidades](${BASE_URL}/features) — Detalle de funcionalidades

### Cluster Pages (Contenido Localizado)

El sitio incluye páginas de cluster específicas por país y modalidad para artística y rítmica.

**España:**

- [Gimnasia Artística en España](${BASE_URL}/es/gimnasia-artistica/espana)
- [Gimnasia Rítmica en España](${BASE_URL}/es/gimnasia-ritmica/espana)

**México:**

- [Gimnasia Artística en México](${BASE_URL}/es/gimnasia-artistica/mexico)
- [Gimnasia Rítmica en México](${BASE_URL}/es/gimnasia-ritmica/mexico)

**Argentina:**

- [Gimnasia Artística en Argentina](${BASE_URL}/es/gimnasia-artistica/argentina)
- [Gimnasia Rítmica en Argentina](${BASE_URL}/es/gimnasia-ritmica/argentina)

**Colombia:**

- [Gimnasia Artística en Colombia](${BASE_URL}/es/gimnasia-artistica/colombia)
- [Gimnasia Rítmica en Colombia](${BASE_URL}/es/gimnasia-ritmica/colombia)

**Chile:**

- [Gimnasia Artística en Chile](${BASE_URL}/es/gimnasia-artistica/chile)
- [Gimnasia Rítmica en Chile](${BASE_URL}/es/gimnasia-ritmica/chile)

**Perú:**

- [Gimnasia Artística en Perú](${BASE_URL}/es/gimnasia-artistica/peru)
- [Gimnasia Rítmica en Perú](${BASE_URL}/es/gimnasia-ritmica/peru)

**Contenido en Inglés:**

- Toda la jerarquía anterior duplicada bajo [${BASE_URL}/en/](${BASE_URL}/en) para audiencia anglosajona.

### Módulos de la Plataforma

- [Gestión de gimnastas](${BASE_URL}/modules/gestion-atletas) — Gimnastas federadas y federados
- [Clases y horarios](${BASE_URL}/modules/clases-horarios) — Programación de clases
- [Eventos y competiciones](${BASE_URL}/modules/eventos-competiciones) — Inscripciones a competiciones
- [Pagos y administración](${BASE_URL}/modules/pagos-administracion) — Cobros y cuotas
- [Comunicación](${BASE_URL}/modules/comunicacion) — Mensajería y notificaciones

### Onboarding

- [Registro de academia](${BASE_URL}/onboarding) — Alta como academia
- [Registro como atleta](${BASE_URL}/onboarding/athlete) — Alta como gimnasta
- [Registro como entrenador](${BASE_URL}/onboarding/coach) — Alta como coach

## Datos de Contacto

- Email: [hola@zaltyko.com](mailto:hola@zaltyko.com)
- Website: [${BASE_URL}](${BASE_URL})
- Instagram: [@zaltyko](https://instagram.com/zaltyko)

## Localización

- **Idiomas soportados:** Español (es), Inglés (en)
- **Divisas:** EUR (Europa), USD (Latinoamérica)
- **Federaciones integradas:** RFEG (España), FMGM (México), CGG (Argentina), FCG (Colombia), FGCh (Chile), FPG (Perú)

## Categorías de Gimnastas Soportadas

- **Gimnasia Artística:** Base, Alevín, Infantil, Junior, Senior, Absoluta
- **Gimnasia Rítmica:** Base, Preinfantil, Infantil, Juvenil, Senior

## Preguntas Frecuentes (Resumen)

- **¿Para qué modalidades sirve Zaltyko?** Gimnasia artística femenina, masculina y rítmica. Configurable como academia mixta.
- **¿Cuánto cuesta?** Free hasta 30 gimnastas y 1 academia gratis. Starter 19 €/mes (hasta 75 gimnastas). Growth 49 €/mes (hasta 200). Network 99 €/mes para multi-sede. Detalle completo en [la página de planes](${BASE_URL}/pricing).
- **¿Funciona en móvil?** Sí. Aplicación web responsive y flujo de coach verificado en móvil, con pase de lista optimizado para pista.
- **¿Cumple protección de datos de menores?** Sí. Datos aislados por academia y controles de acceso por rol y relación autorizada. La gestión de consentimientos y las obligaciones legales de cada academia deben revisarse con su asesoría jurídica.
- **¿Puedo migrar desde Excel o Google Sheets?** Sí. Importación directa de gimnastas desde Excel o CSV; migraciones amplias se hacen de forma guiada.

## Sobre Esta Página

Este archivo [llms.txt](${BASE_URL}/llms.txt) sigue el estándar propuesto en [llmstxt.org](https://llmstxt.org/) para que los modelos de lenguaje y los crawlers agentivos descubran la estructura del sitio sin necesidad de renderizar JavaScript.
`;

export async function GET() {
  return new NextResponse(LLMS_CONTENT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

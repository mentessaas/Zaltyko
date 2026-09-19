import { NextResponse } from "next/server";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

// `llms-full.txt` — la versión extendida del índice `llms.txt` que Zaltyko
// ya sirve en `/llms.txt`. La spec "llms.txt" (emerging) recomienda ambos:
// - `llms.txt` = índice corto con descripción estructural.
// - `llms-full.txt` = el contenido real (texto completo, listas, claims
//   verificables) que los crawlers AI pueden cargar para citación.
//
// Mantenemos este archivo generado a mano, no scrapeado: cada bloque refleja
// copy aprobado en `vault/04-Marketing/Mensajes aprobados.md`. Si ese vault
// cambia, este archivo debe actualizarse a la vez.

const LLMS_FULL = `# Zaltyko — Sistema de dirección para academias de gimnasia

## Resumen del producto

Zaltyko es una plataforma SaaS multi-tenant para academias de gimnasia
artística femenina, artística masculina y rítmica en mercados de habla
hispana (España, México, Argentina, Colombia, Chile y Perú).

Cubre:
- Gestión de gimnastas y familias
- Grupos, horarios, clases y sesiones recurrentes
- Pagos y cobros recurrentes
- Asistencia por sesión
- Evaluaciones técnicas
- Eventos y competiciones
- Comunicación interna (mensajes, avisos, notificaciones)
- Portal familiar limitado (horarios, avisos, progreso publicado, cuotas)
- Reportes y dirección
- Multi-sede bajo acompañamiento

## Planes y precios (v3.0)

| Plan | Precio | Gimnastas | Sedes | Característica principal |
| --- | --- | --- | --- | --- |
| Trial | 0 € (sin tarjeta) | hasta 75 | 1 | Funciones y límites de Starter. 7 días, una activación por academia cada 12 meses. |
| Free | 0 €/mes | hasta 30 | 1 | Crear academia, gimnastas, grupos, asistencia básica, comunicación interna limitada. |
| Starter | 19 €/mes | hasta 75 | 1 | Pagos recurrentes, portal familiar limitado, reportes básicos, progresión técnica. |
| Growth | 49 €/mes | hasta 200 | 1 | Todo Starter + automatizaciones, reportes ejecutivos, soporte prioritario. |
| Network | desde 99 €/mes | ilimitado | multi-sede | Bajo onboarding acompañado. Sin checkout autoservicio. |

Promoción vigente: 7 días de Starter sin tarjeta, una activación por academia
cada 12 meses; al terminar vuelve a Free y no hay cargo automático.

Fee de procesamiento: 0 € markup sobre Stripe directo.

## Modalidades atendidas

- Gimnasia artística femenina (GAF)
- Gimnasia artística masculina (GAM)
- Gimnasia rítmica (GR)

Otras modalidades (acrobática, trampolín) están publicadas como
"Próximamente" en la superficie comercial; aún no se gestionan como
producto.

## Federaciones integradas

- España (RFEG) — categorías oficiales: Iniciación, Alevín, Infantil,
  Junior, Senior, Absoluta. Eventos Liga Iberdrola y Copa de la Reina.
- México (FMGM)
- Argentina (CGG)
- Colombia (FCG)
- Chile (FGCh)
- Perú (FPG)

## Categorías de gimnastas

Gimnasia artística: Base, Alevín, Infantil, Junior, Senior, Absoluta.
Gimnasia rítmica: Base, Preinfantil, Infantil, Juvenil, Senior.

## Estructura del sitio

URL pública: https://zaltyko.com

Rutas principales:
- / — Home con promesa, social proof y módulos
- /pricing — Planes y precios Free, Starter, Growth, Network
- /features — Funcionalidades para academias de gimnasia
- /academias — Directorio público de academias
- /coaches — Directorio de entrenadores
- /events — Eventos y competiciones
- /marketplace — Marketplace B2B
- /empleo — Bolsa de empleo
- /faq — Preguntas frecuentes
- /modules/* — Páginas de módulo (gestión de atletas, clases, cobros,
  comunicación, eventos, reportes, directorio)
- /es/{modality} y /es/{modality}/{country} — Cluster pages SEO por
  modalidad y país. Locales soportados: es, en.

Rutas privadas (noindex): /app/*, /dashboard/*, /super-admin/*, /api/*.

## Mensajes aprobados (marketing)

- Taglines: "Tu academia ordenada, tu mente libre." / "Adios al caos
  administrativo. Hola al crecimiento." / "Gestiona tu academia
  deportiva desde un solo lugar." / "Enfocate en entrenar. Nosotros te
  ayudamos con la administración."
- Promesa principal: "Gestiona tu academia deportiva sin perder el foco en
  lo que importa: formar atletas."
- Trial: 7 días de Starter sin tarjeta, una activación por academia cada
  12 meses; al terminar vuelve a Free y no hay cargo automático.

Claims seguros:
- "Aislamiento por academia" y "controles de acceso".
- "Privacidad por diseño" y "atención por email".
- "Puesta en marcha guiada" (sin duración cerrada).
- "Portal familiar limitado y seguro".
- Importación CSV/Excel como base; migraciones complejas requieren revisión.
- Resultados como beneficios esperados, no porcentajes.

No se publica:
- "100% seguro", "cumplimiento RGPD garantizado", "RGPD Compliant".
- Tiempos de respuesta cerrados sin evidencia operativa.
- Testimonios con nombres o métricas concretas sin autorización.
- Precios anuales o descuentos anuales.
- Academias ilimitadas en Starter o Growth.
- Multi-sede autoservicio sin onboarding acompañado.
- WhatsApp como canal principal v1.

## Contacto

- Email: hola@zaltyko.com
- Sitio: https://zaltyko.com
- Idiomas: Español (es), Inglés (en)
- Divisas: EUR, USD, MXN, COP, ARS, CLP

## APIs y endpoints relevantes

- Sitemap XML: https://zaltyko.com/sitemap.xml
- Robots: https://zaltyko.com/robots.txt
- llms.txt (índice corto): https://zaltyko.com/llms.txt
- llms-full.txt (este archivo): https://zaltyko.com/llms-full.txt
- Open Graph image: https://zaltyko.com/og-image.png
`;

export async function GET() {
  const baseUrl = getPublicSiteUrl();
  const body = LLMS_FULL.replace(/https:\/\/zaltyko\.com/g, baseUrl);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

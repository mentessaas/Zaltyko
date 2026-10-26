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

const LLMS_FULL = `# Zaltyko — Software para academias de gimnasia

Lanzamiento en España, español y euros.
- Registro, consentimiento, confirmación y recuperación de cuenta.
- Gimnastas, familias y responsables; alta, edición y archivo.
- Grupos, clases, inscripciones y asistencia por sesión.
- Cuotas familiares mensuales y registro manual de pagos.
- Resumen calculado desde datos persistidos y navegación adaptable.

Zaltyko no inicia cargos automáticos a las familias.
La suscripción SaaS de la academia es independiente de esas cuotas.
Health Score, retención, IA, marketplace y funciones avanzadas no forman parte de esta versión.

Free: 30 gimnastas, 3 grupos y 10 clases activas.
Starter: 19 €/mes o 190 €/año, hasta 75 gimnastas.
Growth: 49 €/mes o 490 €/año, hasta 200 gimnastas.
Precios sin IVA. Network desde 99 €/mes, contratación acompañada.
Prueba de Starter de 7 días sin tarjeta, una por academia cada 12 meses.
Al terminar el acceso se aplican límites Free: si hay excedente, solo lectura hasta archivar o contratar capacidad.

Rutas: /, /features, /pricing, /faq, /ayuda, /auth/register?role=owner.
Condiciones: /terminos. Privacidad: /politica-privacidad.
Contacto: hola@zaltyko.com.
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

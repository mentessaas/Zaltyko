import { NextResponse } from "next/server";

const LLMS_CONTENT = `# Zaltyko — Software para academias de gimnasia

Detalle: /llms-full.txt.

Lanzamiento en español; alta abierta a academias de cualquier país, con España y México como mercados prioritarios.
- Registro, consentimiento, confirmación y recuperación de cuenta.
- Gimnastas, familias y responsables; alta, edición y archivo.
- Grupos, clases, inscripciones y asistencia por sesión.
- Cuotas familiares mensuales y registro manual de pagos.
- Resumen calculado desde datos persistidos y navegación adaptable.

Zaltyko no inicia cargos automáticos a las familias.
La suscripción SaaS de la academia es independiente de esas cuotas.
Health Score, retención, IA, marketplace y funciones avanzadas no forman parte de esta versión.

Gratis: 0 €, hasta 30 gimnastas y 2 personas en el equipo; grupos y clases sin límite.
Club: 29 €/mes o 290 €/año, IVA incluido; sin límite de gimnastas, equipo, grupos ni clases.
La primera sede está incluida en Club; cada sede adicional cuesta 20 €/mes o 200 €/año, IVA incluido.
Prueba Club durante 30 días, sin tarjeta. México todavía no tiene precio publicado.

Rutas: /, /features, /pricing, /faq, /ayuda, /auth/register?role=owner.
Condiciones: /terminos. Privacidad: /politica-privacidad.
Contacto: hola@zaltyko.com.
`;

export async function GET() {
  return new NextResponse(LLMS_CONTENT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

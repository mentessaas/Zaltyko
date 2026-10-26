import { NextResponse } from "next/server";

const LLMS_CONTENT = `# Zaltyko — Software para academias de gimnasia

Detalle: /llms-full.txt.

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
  return new NextResponse(LLMS_CONTENT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

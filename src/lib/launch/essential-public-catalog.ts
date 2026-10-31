/** Public launch claims. Keep visible content and structured data identical. */
export const ESSENTIAL_FEATURES = [
  {
    id: "gimnastas", label: "Gimnastas y familias", title: "Fichas y vínculos familiares",
    features: ["Alta y edición de gimnastas", "Asociación de familias y responsables", "Archivo de fichas conservando el historial"],
    impact: "Consulta la información de tu academia en un solo lugar",
  },
  {
    id: "clases", label: "Grupos y clases", title: "Grupos, horarios e inscripciones",
    features: ["Organización de grupos por sede", "Clases con horario y capacidad", "Inscripciones y cambios de estado"],
    impact: "Organiza las plazas y la actividad de cada grupo",
  },
  {
    id: "asistencia", label: "Asistencia", title: "Asistencia por sesión",
    features: ["Selección de clase y sesión", "Registro de asistencia", "Consulta de marcas guardadas"],
    impact: "Mantén un registro de cada entrenamiento",
  },
  {
    id: "billing", label: "Cuotas manuales", title: "Cuotas y pagos registrados",
    features: ["Emisión de cuotas mensuales por familia", "Persona pagadora y fecha de vencimiento", "Registro manual de pagos recibidos", "Consulta de cargos pendientes"],
    impact: "Distingue lo emitido, lo pendiente y lo recibido sin iniciar cargos automáticos",
  },
  {
    id: "resumen", label: "Resumen", title: "Resumen de actividad",
    features: ["Gimnastas y grupos activos", "Registros de asistencia del periodo", "Cobros manuales registrados por moneda"],
    impact: "Consulta cifras calculadas desde los datos guardados",
  },
];

export const ESSENTIAL_FAQS = [
  { question: "¿Para qué academias está pensado?", answer: "Para academias de gimnasia artística y rítmica en España. La aplicación está en español y los planes SaaS se contratan en euros." },
  { question: "¿Qué planes puedo contratar?", answer: "Free incluye hasta 30 gimnastas, 3 grupos y 10 clases activas. Starter cuesta 19 €/mes o 190 €/año hasta 75 gimnastas; Growth, 49 €/mes o 490 €/año hasta 200. Precios sin IVA. Network parte de 99€/mes, sin IVA; su propuesta final se acuerda mediante contacto y puesta en marcha acompañada." },
  { question: "¿Zaltyko cobra automáticamente a las familias?", answer: "Las cuotas familiares se emiten y sus pagos se registran manualmente. La suscripción de tu academia a Starter o Growth es una contratación SaaS independiente." },
  { question: "¿Qué ocurre al cancelar o terminar la prueba?", answer: "Al finalizar el periodo de acceso, la academia vuelve a Free. Si supera sus límites, conserva sus datos y queda en solo lectura hasta archivar el excedente o contratar capacidad suficiente." },
  { question: "¿Cómo empiezo?", answer: "Crea tu cuenta, confirma el correo y configura tu academia y sede. Después puedes añadir gimnastas, familias, grupos y clases. Si necesitas varias sedes, contacta para revisar Network." },
  { question: "¿Cómo se aborda la protección de datos de menores?", answer: "Zaltyko aísla los datos por academia y aplica controles de acceso por rol. La academia debe gestionar los permisos y la información de sus familias conforme a su política de privacidad; estos controles no sustituyen sus obligaciones." },
  { question: "¿Puedo usarlo desde el móvil?", answer: "Zaltyko es una aplicación web adaptable a móvil, tableta y ordenador. No necesitas instalar una aplicación para acceder desde el navegador." },
];

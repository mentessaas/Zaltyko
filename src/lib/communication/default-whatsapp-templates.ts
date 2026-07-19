export interface WhatsAppTemplateConfig {
  id: string;
  name: string;
  content: string;
  category: "reminder" | "payment" | "schedule" | "event" | "custom";
  sportConfigId: string | null;
}

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplateConfig[] = [
  {
    id: "class-reminder",
    name: "Recordatorio de clase",
    content: "Hola {{name}}, te recordamos que tienes clase de {{class}} manana a las {{time}}.",
    category: "reminder",
    sportConfigId: null,
  },
  {
    id: "payment-reminder",
    name: "Recordatorio de pago",
    content: "Hola {{name}}, tienes un pago pendiente de {{amount}} EUR. Por favor, realiza el pago lo antes posible.",
    category: "payment",
    sportConfigId: null,
  },
  {
    id: "schedule-change",
    name: "Cambio de horario",
    content: "Hola {{name}}, informamos que el horario de {{class}} ha cambiado. Nueva hora: {{newTime}}.",
    category: "schedule",
    sportConfigId: null,
  },
  {
    id: "new-event",
    name: "Nuevo evento",
    content: "Hola {{name}}, se ha publicado un nuevo evento: {{eventName}}. Fecha: {{eventDate}}.",
    category: "event",
    sportConfigId: null,
  },
  {
    id: "custom",
    name: "Mensaje personalizado",
    content: "",
    category: "custom",
    sportConfigId: null,
  },
];

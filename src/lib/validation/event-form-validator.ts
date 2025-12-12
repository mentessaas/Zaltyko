import type { EventFormData } from "@/types/event-form";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Valida las fechas del formulario de eventos
 */
export function validateEventDates(data: EventFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validar que startDate existe
  if (!data.startDate) {
    errors.push({
      field: "startDate",
      message: "La fecha de inicio es requerida",
    });
    return errors; // Si no hay startDate, no tiene sentido validar el resto
  }

  const startDate = new Date(data.startDate);
  const endDate = data.endDate ? new Date(data.endDate) : null;
  const registrationStartDate = data.registrationStartDate
    ? new Date(data.registrationStartDate)
    : null;
  const registrationEndDate = data.registrationEndDate
    ? new Date(data.registrationEndDate)
    : null;

  // Validar registrationStartDate <= registrationEndDate
  if (registrationStartDate && registrationEndDate) {
    if (registrationStartDate > registrationEndDate) {
      errors.push({
        field: "registrationStartDate",
        message: "La fecha de inicio de inscripción debe ser anterior a la fecha de fin",
      });
    }
  }

  // Validar registrationEndDate <= startDate
  if (registrationEndDate && startDate) {
    if (registrationEndDate > startDate) {
      errors.push({
        field: "registrationEndDate",
        message: "La fecha de fin de inscripción debe ser anterior a la fecha de inicio del evento",
      });
    }
  }

  // Validar startDate <= endDate
  if (endDate && startDate > endDate) {
    errors.push({
      field: "endDate",
      message: "La fecha de inicio debe ser anterior a la fecha de fin",
    });
  }

  return errors;
}

/**
 * Valida todos los campos del formulario de eventos
 */
export function validateEventForm(data: EventFormData): ValidationResult {
  const errors: ValidationError[] = [];

  // Validar título
  if (!data.title || data.title.trim() === "") {
    errors.push({
      field: "title",
      message: "El título es requerido",
    });
  }

  // Validar nivel
  if (!data.level) {
    errors.push({
      field: "level",
      message: "El nivel es requerido",
    });
  }

  // Validar fechas
  const dateErrors = validateEventDates(data);
  errors.push(...dateErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}


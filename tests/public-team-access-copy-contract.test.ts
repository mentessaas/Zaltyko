import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const homeCopy = readFileSync(
  join(root, "src/app/(site)/home/SocialProofSection.tsx"),
  "utf8"
);
const classesCopy = readFileSync(
  join(root, "src/app/(site)/modules/clases-horarios/page.tsx"),
  "utf8"
);

describe("public team access copy", () => {
  it("does not promise that coaches already receive role-based access", () => {
    expect(homeCopy).toContain(
      "El acceso propio de entrenadores está en preparación."
    );
    expect(homeCopy).not.toContain(
      "Coaches y familias entran con acceso según su rol"
    );
    expect(homeCopy).toContain(
      "Crea y mantén las fichas de tus gimnastas desde el panel de gestión."
    );
    expect(homeCopy).not.toContain("Excel o CSV");
    expect(homeCopy).not.toContain("Cuotas recurrentes");
    expect(homeCopy).toContain("registra los pagos manualmente");
  });

  it("keeps coach assignment and attendance attributed honestly", () => {
    expect(classesCopy).toContain(
      "La asignación de entrenadores con acceso propio está en preparación."
    );
    expect(classesCopy).toContain(
      "La dirección registra la asistencia de cada sesión y consulta las marcas guardadas."
    );
    expect(classesCopy).toContain(
      "El acceso y la asignación de entrenadores están en preparación."
    );
    expect(classesCopy).not.toContain("Los entrenadores marcan presencias");
    expect(classesCopy).not.toContain("Consulta tu programación diaria");
    expect(classesCopy).not.toContain("lista de espera");
    expect(classesCopy).not.toMatch(/notifica al siguiente/i);
    expect(classesCopy).not.toContain("Los padres pueden justificar ausencias");
    expect(classesCopy).not.toContain("alerta sobre patrones de inasistencia");
    expect(classesCopy).not.toContain("Notificaciones automáticas de cambios");
    expect(classesCopy).not.toContain("disponibilidad real de cada horario");
    expect(classesCopy).not.toContain("Analiza qué horarios tienen mayor demanda");
    expect(classesCopy).not.toContain("inscripciones automáticas");
    expect(classesCopy).not.toContain("Calendario visual");
    expect(classesCopy).not.toContain("calendario visual intuitivo");
    expect(classesCopy).not.toContain("vistas diaria, semanal y mensual");
  });
});

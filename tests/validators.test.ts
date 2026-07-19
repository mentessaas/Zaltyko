/**
 * Tests de los validators compartidos por todos los formularios del producto.
 * Cubre la logica de validacion en componentes UI (FormField, AthleteForm,
 * ClassForm, BillingForm, etc.).
 */
import { describe, it, expect } from "vitest";
import { validators } from "@/components/ui/form-field";

describe("Validators", () => {
  describe("required", () => {
    it("rechaza string vacio", () => {
      expect(validators.required()("")).toBeTruthy();
      expect(validators.required()("   ")).toBeTruthy();
    });

    it("acepta string con contenido", () => {
      expect(validators.required()("algo")).toBeNull();
    });

    it("usa mensaje custom si se pasa", () => {
      expect(validators.required("Nombre obligatorio")("")).toBe(
        "Nombre obligatorio"
      );
    });
  });

  describe("email", () => {
    const validate = validators.email();

    it("acepta vacio (responsabilidad de required)", () => {
      expect(validate("")).toBeNull();
    });

    it("acepta emails validos", () => {
      expect(validate("user@example.com")).toBeNull();
      expect(validate("a.b+c@sub.domain.io")).toBeNull();
    });

    it("rechaza emails sin @", () => {
      expect(validate("notanemail")).toBeTruthy();
    });

    it("rechaza emails sin dominio", () => {
      expect(validate("user@")).toBeTruthy();
      expect(validate("user@example")).toBeTruthy();
    });

    it("rechaza emails con espacios", () => {
      expect(validate("user @example.com")).toBeTruthy();
    });
  });

  describe("minLength", () => {
    it("acepta vacio (responsabilidad de required)", () => {
      expect(validators.minLength(8)("")).toBeNull();
    });

    it("rechaza longitud insuficiente", () => {
      expect(validators.minLength(8)("short")).toBeTruthy();
    });

    it("acepta longitud exacta", () => {
      expect(validators.minLength(8)("12345678")).toBeNull();
    });

    it("usa mensaje custom", () => {
      expect(validators.minLength(10, "Minimo 10")("short")).toBe("Minimo 10");
    });
  });

  describe("maxLength", () => {
    it("acepta longitud dentro del limite", () => {
      expect(validators.maxLength(50)("hola")).toBeNull();
    });

    it("rechaza longitud excedida", () => {
      expect(validators.maxLength(5)("demasiado largo")).toBeTruthy();
    });
  });

  describe("pattern", () => {
    const phonePattern = /^[0-9]{9}$/;
    const validate = validators.pattern(phonePattern, "Telefono invalido");

    it("acepta valores que cumplen el patron", () => {
      expect(validate("123456789")).toBeNull();
    });

    it("rechaza valores que no cumplen", () => {
      expect(validate("123-456-789")).toBe("Telefono invalido");
      expect(validate("12345")).toBe("Telefono invalido");
    });
  });

  describe("combine", () => {
    const validate = validators.combine(
      validators.required(),
      validators.email(),
      validators.minLength(5)
    );

    it("devuelve el primer error en orden de declaracion", () => {
      expect(validate("")).toBe("Este campo es obligatorio");
      // "a@b" no es email valido (sin TLD), email falla antes que minLength
      expect(validate("a@b")).toBe("Correo electrónico inválido");
      // "abc" es email invalido pero mas corto: email falla primero
      expect(validate("abc")).toBe("Correo electrónico inválido");
    });

    it("devuelve null si todos pasan", () => {
      expect(validate("user@example.com")).toBeNull();
    });

    it("minLength puede ejecutarse primero si el orden lo permite", () => {
      const validateMinFirst = validators.combine(
        validators.required(),
        validators.minLength(5),
        validators.email()
      );
      // "a@b" tiene 3 chars, minLength falla antes que email
      expect(validateMinFirst("a@b")).toBe("Debe tener al menos 5 caracteres");
    });
  });
});

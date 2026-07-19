import { describe, expect, it } from "vitest";

import { parseMailbox } from "@/lib/email/mailbox";

describe("parseMailbox", () => {
  it("normaliza una dirección simple", () => {
    expect(parseMailbox("  HOLA@ZALTYKO.COM ")).toEqual({
      email: "hola@zaltyko.com",
    });
  });

  it("acepta nombre visible y dirección entre ángulos", () => {
    expect(parseMailbox("Equipo Zaltyko <hola@zaltyko.com>")).toEqual({
      name: "Equipo Zaltyko",
      email: "hola@zaltyko.com",
    });
  });

  it("acepta un nombre visible entre comillas", () => {
    expect(parseMailbox('"Equipo Zaltyko" <hola@zaltyko.com>')).toEqual({
      name: "Equipo Zaltyko",
      email: "hola@zaltyko.com",
    });
  });

  it.each([
    "",
    "Equipo Zaltyko",
    "Equipo <correo-invalido>",
    "<hola@zaltyko.com>",
    "Uno <uno@zaltyko.com>, Dos <dos@zaltyko.com>",
    "Uno <uno@zaltyko.com> texto",
  ])("rechaza un mailbox inválido: %s", (value) => {
    expect(parseMailbox(value)).toBeNull();
  });
});

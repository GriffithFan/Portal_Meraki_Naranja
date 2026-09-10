/**
 * El candado de la sección Personal.
 *
 * Es una lista fija en código, a propósito: no pasa por la matriz de Permisos, así que
 * una cuenta ADMIN nueva NO entra sola. Eso la hace segura y también fácil de romper sin
 * enterarse — un dominio mal escrito no falla, simplemente deja a alguien afuera (o, en
 * el caso de PERSONAL_ONLY, deja a alguien adentro de todo el sistema cuando debía estar
 * encerrado en Personal).
 *
 * El detalle que estos tests fijan: las cuentas internas usan @thnet.com SIN .ar, pero
 * Luis tiene dos cuentas ADMIN activas, una en cada dominio.
 */
import { describe, expect, it } from "vitest";
import {
  esPersonalOnly,
  esSeccionValida,
  FICHAS_EMAILS,
  PERSONAL_ONLY_EMAILS,
  tieneAccesoFichas,
} from "@/lib/fichasAccess";

describe("tieneAccesoFichas", () => {
  it("deja entrar a cada cuenta de la lista", () => {
    for (const email of FICHAS_EMAILS) {
      expect(tieneAccesoFichas(email)).toBe(true);
    }
  });

  it("deja entrar a las DOS cuentas de Luis: son la misma persona en dos dominios", () => {
    expect(tieneAccesoFichas("luis@thnet.com")).toBe(true);
    expect(tieneAccesoFichas("luis@thnet.com.ar")).toBe(true);
  });

  it("no deja entrar a nadie más, por más ADMIN que sea", () => {
    for (const email of ["otro@thnet.com", "ulises@thnet.com.ar", "admin@thnet.com", ""]) {
      expect(tieneAccesoFichas(email)).toBe(false);
    }
  });

  it("no confunde dominios parecidos", () => {
    // Un dominio de más o de menos deja a alguien afuera sin ningún error visible.
    for (const email of ["luis@thnet.com.br", "luis@thnet.ar", "luis@thnetcom.ar", "luis@thnet.co"]) {
      expect(tieneAccesoFichas(email)).toBe(false);
    }
  });

  it("tolera espacios y mayúsculas, que es como llegan de un formulario", () => {
    expect(tieneAccesoFichas("  LUIS@THNET.COM.AR  ")).toBe(true);
  });

  it("dice que no cuando no hay email", () => {
    expect(tieneAccesoFichas(null)).toBe(false);
    expect(tieneAccesoFichas(undefined)).toBe(false);
  });
});

describe("esPersonalOnly", () => {
  it("las cuentas encerradas en Personal también tienen que poder entrar a Personal", () => {
    // Si una está en PERSONAL_ONLY pero no en FICHAS_EMAILS, el middleware la mantiene
    // dentro de una sección a la que el candado le niega la entrada: no puede usar nada.
    for (const email of PERSONAL_ONLY_EMAILS) {
      expect(tieneAccesoFichas(email)).toBe(true);
    }
  });

  it("nadie más está encerrado", () => {
    expect(esPersonalOnly("luis@thnet.com.ar")).toBe(false);
    expect(esPersonalOnly("griffith@thnet.com")).toBe(false);
    expect(esPersonalOnly(null)).toBe(false);
  });
});

describe("esSeccionValida", () => {
  it("acepta las secciones de una ficha", () => {
    for (const s of ["nombre", "dni", "carnet", "seguro", "monotributo", "general"]) {
      expect(esSeccionValida(s)).toBe(true);
    }
  });

  it("rechaza cualquier otra cosa", () => {
    for (const s of ["", "otra", "../etc/passwd", "NOMBRE"]) {
      expect(esSeccionValida(s)).toBe(false);
    }
  });
});

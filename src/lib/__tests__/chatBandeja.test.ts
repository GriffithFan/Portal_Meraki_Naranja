import { describe, it, expect } from "vitest";
import { duracionCorta, grupoBandeja, nivelEspera, ordenarBandeja } from "@/lib/chatBandeja";

const conv = (id: string, o: Partial<{ estado: string; agenteId: string | null; updatedAt: string; esperandoDesde: string | null; pendientes: number }>) => ({
  id,
  estado: "EN_CURSO",
  agenteId: "mesa1",
  updatedAt: "2026-09-15T12:00:00Z",
  esperandoDesde: null,
  pendientes: 0,
  ...o,
});

describe("grupoBandeja", () => {
  it("clasifica sin tomar, esperando, respondidas y cerradas", () => {
    expect(grupoBandeja(conv("a", { estado: "ABIERTA", agenteId: null }))).toBe("sin-tomar");
    expect(grupoBandeja(conv("b", { pendientes: 2 }))).toBe("esperando");
    expect(grupoBandeja(conv("c", { pendientes: 0 }))).toBe("respondidas");
    expect(grupoBandeja(conv("d", { estado: "CERRADA", pendientes: 3 }))).toBe("cerradas");
  });
});

describe("ordenarBandeja — que nadie se pierda", () => {
  it("una parte nueva NO sube la conversación: manda quién espera hace más", () => {
    // Juan espera desde 12:00 y acaba de mandar otra parte (updatedAt 12:09).
    // Ana espera desde 12:05 y no escribió más. Juan tiene que seguir arriba.
    const juan = conv("juan", { pendientes: 4, esperandoDesde: "2026-09-15T12:00:00Z", updatedAt: "2026-09-15T12:09:00Z" });
    const ana = conv("ana", { pendientes: 1, esperandoDesde: "2026-09-15T12:05:00Z", updatedAt: "2026-09-15T12:05:00Z" });
    expect(ordenarBandeja([ana, juan]).map((c) => c.id)).toEqual(["juan", "ana"]);
  });

  it("orden de grupos: sin tomar, esperando, respondidas (recientes arriba), cerradas", () => {
    const lista = [
      conv("cerrada", { estado: "CERRADA", updatedAt: "2026-09-15T12:30:00Z" }),
      conv("resp-vieja", { updatedAt: "2026-09-15T11:00:00Z" }),
      conv("esperando", { pendientes: 1, esperandoDesde: "2026-09-15T12:20:00Z" }),
      conv("resp-nueva", { updatedAt: "2026-09-15T12:25:00Z" }),
      conv("sin-tomar", { estado: "ABIERTA", agenteId: null, esperandoDesde: "2026-09-15T12:29:00Z" }),
    ];
    expect(ordenarBandeja(lista).map((c) => c.id)).toEqual(["sin-tomar", "esperando", "resp-nueva", "resp-vieja", "cerrada"]);
  });

  it("no modifica el arreglo original", () => {
    const lista = [conv("b", { updatedAt: "2026-09-15T10:00:00Z" }), conv("a", { updatedAt: "2026-09-15T11:00:00Z" })];
    ordenarBandeja(lista);
    expect(lista.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("tiempo de espera", () => {
  const ahora = Date.parse("2026-09-15T12:30:00Z");
  it("nivel por minutos: <5 reciente, <15 atención, después urgente", () => {
    expect(nivelEspera("2026-09-15T12:27:00Z", ahora)).toBe("reciente");
    expect(nivelEspera("2026-09-15T12:20:00Z", ahora)).toBe("atencion");
    expect(nivelEspera("2026-09-15T12:10:00Z", ahora)).toBe("urgente");
    expect(nivelEspera(null, ahora)).toBeNull();
  });
  it("duración corta legible", () => {
    expect(duracionCorta("2026-09-15T12:29:40Z", ahora)).toBe("ahora");
    expect(duracionCorta("2026-09-15T12:18:00Z", ahora)).toBe("12 min");
    expect(duracionCorta("2026-09-15T11:10:00Z", ahora)).toBe("1 h 20 min");
    expect(duracionCorta("2026-09-15T10:30:00Z", ahora)).toBe("2 h");
  });
});

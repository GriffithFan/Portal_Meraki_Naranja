import { describe, it, expect } from "vitest";
import { cursorDeMensajes, fusionarMensajes, haySinLeerDeOtro } from "@/lib/chatSync";

const msg = (id: string, createdAt: string, updatedAt = createdAt, autorId = "tec") => ({ id, createdAt, updatedAt, autorId });

describe("cursorDeMensajes", () => {
  it("usa el updatedAt más nuevo: una reacción a un mensaje viejo corre el cursor", () => {
    const mensajes = [
      msg("a", "2026-09-15T11:50:00.000Z", "2026-09-15T11:57:00.000Z"), // reaccionado después
      msg("b", "2026-09-15T11:56:54.147Z"),
    ];
    expect(cursorDeMensajes(mensajes)).toBe("2026-09-15T11:57:00.000Z");
  });

  it("sin updatedAt cae al createdAt; sin mensajes no hay cursor", () => {
    expect(cursorDeMensajes([{ id: "a", createdAt: "2026-09-15T10:00:00.000Z" }])).toBe("2026-09-15T10:00:00.000Z");
    expect(cursorDeMensajes([])).toBeNull();
  });
});

describe("fusionarMensajes", () => {
  const base = [msg("a", "2026-09-15T10:00:00.000Z"), msg("b", "2026-09-15T10:01:00.000Z")];

  it("si lo que llega ya estaba igual, devuelve el mismo arreglo (no hay render)", () => {
    const copia = base.map((m) => ({ ...m }));
    expect(fusionarMensajes(base, copia)).toBe(base);
    expect(fusionarMensajes(base, [])).toBe(base);
  });

  it("reemplaza el que cambió y agrega el nuevo en orden de creación", () => {
    const editado = msg("a", "2026-09-15T10:00:00.000Z", "2026-09-15T10:05:00.000Z");
    const nuevo = msg("c", "2026-09-15T10:02:00.000Z");
    const r = fusionarMensajes(base, [nuevo, editado]);
    expect(r.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(r[0].updatedAt).toBe("2026-09-15T10:05:00.000Z");
  });
});

describe("haySinLeerDeOtro — lo que corta el bucle", () => {
  const leido = "2026-09-15T11:57:00.000Z";

  it("un mensaje viejo que volvió por una reacción NO cuenta como sin leer", () => {
    const reaccionado = msg("a", "2026-09-15T11:50:00.000Z", "2026-09-15T11:58:00.000Z", "mesa");
    expect(haySinLeerDeOtro([reaccionado], "tec", leido)).toBe(false);
  });

  it("un mensaje de otro posterior a la lectura sí; uno propio no", () => {
    expect(haySinLeerDeOtro([msg("b", "2026-09-15T11:58:00.000Z", undefined, "mesa")], "tec", leido)).toBe(true);
    expect(haySinLeerDeOtro([msg("b", "2026-09-15T11:58:00.000Z", undefined, "tec")], "tec", leido)).toBe(false);
  });

  it("si nunca leyó, cualquier mensaje de otro cuenta", () => {
    expect(haySinLeerDeOtro([msg("a", "2026-09-01T10:00:00.000Z", undefined, "mesa")], "tec", null)).toBe(true);
  });
});

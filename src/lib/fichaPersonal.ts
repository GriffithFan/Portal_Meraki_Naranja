import { Prisma } from "@prisma/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIPOS = ["TECNICO", "CONTRATISTA"];

/** Normaliza el cuerpo de una request a los campos editables de una ficha de personal. */
export function normalizeFichaBody(body: any) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);
  const data: any = {
    tipo: TIPOS.includes(body?.tipo) ? body.tipo : "TECNICO",
    nombre: typeof body?.nombre === "string" ? body.nombre.trim().slice(0, 200) : "",
    dni: str(body?.dni),
    direccion: str(body?.direccion),
    telefono: str(body?.telefono),
    carnet: str(body?.carnet),
    seguro: str(body?.seguro),
    monotributo: str(body?.monotributo),
    autoModelo: str(body?.autoModelo),
    autoPatente: str(body?.autoPatente),
    autoTarjetaRed: str(body?.autoTarjetaRed),
    proyecto: str(body?.proyecto),
    notasGenerales: typeof body?.notasGenerales === "string" ? body.notasGenerales.slice(0, 5000) : null,
  };
  // Kilómetros: entero opcional
  if (body?.autoKmts === null || body?.autoKmts === "" || body?.autoKmts === undefined) {
    data.autoKmts = null;
  } else {
    const n = parseInt(String(body.autoKmts), 10);
    data.autoKmts = Number.isFinite(n) ? n : null;
  }
  // Notas por apartado (JSON acotado a strings)
  if (body?.notasSecciones && typeof body.notasSecciones === "object" && !Array.isArray(body.notasSecciones)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.notasSecciones)) {
      if (typeof v === "string" && v.trim()) out[k.slice(0, 40)] = v.slice(0, 5000);
    }
    data.notasSecciones = out as Prisma.InputJsonValue;
  } else {
    data.notasSecciones = Prisma.JsonNull;
  }
  return data;
}

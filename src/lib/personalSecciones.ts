/**
 * Estructura dinámica de campos de una ficha de Personal.
 * Cada ficha tiene su propia lista de secciones (independiente de las demás):
 * puede borrar, renombrar o agregar secciones y campos sin afectar a otras.
 */

export type TipoCampo = "text" | "number" | "date";

export interface CampoFicha {
  id: string;      // estable; para los campos estándar coincide con la clave legacy (dni, carnet…)
  label: string;
  valor: string;
  tipo: TipoCampo;
  nota?: string;   // nota corta del campo
}

export interface SeccionFicha {
  id: string;
  titulo: string;
  campos: CampoFicha[];
}

export function nuevoId(prefijo = "c"): string {
  return `${prefijo}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function campo(id: string, label: string, tipo: TipoCampo = "text", valor = ""): CampoFicha {
  return { id, label, valor, tipo, nota: "" };
}

/**
 * Plantilla por defecto para fichas NUEVAS (arrancan con las secciones estándar
 * ya puestas; el usuario solo completa valores, y puede editar la estructura).
 */
export function plantillaSecciones(): SeccionFicha[] {
  return [
    {
      id: "datos-personales",
      titulo: "Datos personales",
      campos: [campo("dni", "DNI"), campo("direccion", "Dirección"), campo("telefono", "Teléfono")],
    },
    {
      id: "documentacion",
      titulo: "Documentación",
      campos: [campo("carnet", "Carnet"), campo("seguro", "Seguro"), campo("monotributo", "Monotributo")],
    },
    {
      id: "vehiculo",
      titulo: "Vehículo",
      campos: [
        campo("autoModelo", "Modelo"),
        campo("autoPatente", "Patente"),
        campo("autoKmts", "Kilómetros", "number"),
        campo("autoTarjetaRed", "Tarjeta en red"),
      ],
    },
  ];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Convierte una ficha legacy (columnas fijas + camposExtra + notasSecciones) a la
 * estructura `secciones`. Reusa las claves legacy como id de campo para que los
 * adjuntos existentes (FichaArchivo.seccion = "seguro", "monotributo", …) sigan
 * apuntando al campo correcto sin migrar la tabla de archivos.
 */
export function fichaLegacyASecciones(f: any): SeccionFicha[] {
  const notas: Record<string, string> = (f?.notasSecciones && typeof f.notasSecciones === "object") ? f.notasSecciones : {};
  const val = (x: any) => (x === null || x === undefined ? "" : String(x));
  const conNota = (c: CampoFicha): CampoFicha => ({ ...c, nota: notas[c.id] || "" });

  const secciones: SeccionFicha[] = [
    {
      id: "datos-personales",
      titulo: "Datos personales",
      campos: [
        conNota(campo("dni", "DNI", "text", val(f.dni))),
        conNota(campo("direccion", "Dirección", "text", val(f.direccion))),
        conNota(campo("telefono", "Teléfono", "text", val(f.telefono))),
      ],
    },
    {
      id: "documentacion",
      titulo: "Documentación",
      campos: [
        conNota(campo("carnet", "Carnet", "text", val(f.carnet))),
        conNota(campo("seguro", "Seguro", "text", val(f.seguro))),
        conNota(campo("monotributo", "Monotributo", "text", val(f.monotributo))),
      ],
    },
    {
      id: "vehiculo",
      titulo: "Vehículo",
      campos: [
        campo("autoModelo", "Modelo", "text", val(f.autoModelo)),
        campo("autoPatente", "Patente", "text", val(f.autoPatente)),
        campo("autoKmts", "Kilómetros", "number", val(f.autoKmts)),
        campo("autoTarjetaRed", "Tarjeta en red", "text", val(f.autoTarjetaRed)),
      ].map((c) => (c.id === "autoTarjetaRed" ? conNota(c) : c)),
    },
  ];

  // camposExtra → sección "Datos adicionales"
  const extra = (f?.camposExtra && typeof f.camposExtra === "object") ? f.camposExtra : null;
  if (extra) {
    const campos = Object.entries(extra)
      .filter(([k]) => k)
      .map(([k, v]) => campo(nuevoId(), String(k), "text", val(v)));
    if (campos.length) secciones.push({ id: "datos-adicionales", titulo: "Datos adicionales", campos });
  }

  return secciones;
}

/** Normaliza/valida lo que llega del cliente antes de guardar en la ficha. */
export function sanitizarSecciones(input: any): SeccionFicha[] {
  if (!Array.isArray(input)) return [];
  const tipos: TipoCampo[] = ["text", "number", "date"];
  return input.slice(0, 40).map((s: any) => ({
    id: String(s?.id || nuevoId("s")).slice(0, 40),
    titulo: String(s?.titulo ?? "").slice(0, 120),
    campos: Array.isArray(s?.campos)
      ? s.campos.slice(0, 60).map((c: any) => ({
          id: String(c?.id || nuevoId()).slice(0, 40),
          label: String(c?.label ?? "").slice(0, 120),
          valor: String(c?.valor ?? "").slice(0, 5000),
          tipo: tipos.includes(c?.tipo) ? c.tipo : "text",
          nota: String(c?.nota ?? "").slice(0, 2000),
        }))
      : [],
  }));
}

/**
 * Campos personalizados del predio que el TECNICO puede completar desde el campo.
 *
 * Viven dentro del JSON `Predio.camposExtra` (no son columnas de la tabla), pero a
 * diferencia del resto de los campos personalizados —que solo edita un admin— estos
 * los carga el propio tecnico, asi que hay una lista blanca y una validacion de
 * valores en `PATCH /api/tareas/[id]`.
 *
 * TODO lo que necesita cada campo esta en `CAMPOS_TECNICO`: la validacion de la API,
 * el control del detalle, el chip de la lista y la columna de facturacion salen de
 * ahi. Agregar un campo nuevo es agregar una entrada a ese array y nada mas.
 *
 * Por que un registro y no codigo suelto: `recablear` existia hace meses, se cargaba
 * bien y se veia en pantalla, pero NUNCA salio en el CSV de facturacion — las columnas
 * estaban escritas a mano en dos lugares distintos y una se quedo vieja. El dato
 * estaba, quien liquidaba no lo veia. Con una sola fuente eso no puede volver a pasar.
 */

export type TipoCampoTecnico = "opciones" | "numero";

export interface CampoTecnicoDef {
  /** Clave dentro de `camposExtra`. */
  clave: string;
  /** Titulo del bloque en el detalle y encabezado de la columna en el reporte. */
  etiqueta: string;
  /** Texto de ayuda debajo del control, en la voz del tecnico. */
  ayuda: string;
  tipo: TipoCampoTecnico;
  /** "opciones": valores validos guardados, en el orden en que se muestran. */
  opciones?: readonly string[];
  /** Como se muestra cada opcion. Sin entrada, se muestra el valor guardado. */
  etiquetaOpcion?: Readonly<Record<string, string>>;
  /** "numero": tope aceptado. El minimo siempre es 1; vacio = no cargo nada. */
  max?: number;
  /** "numero": que se esta contando, para el total del reporte ("puntos", "AP"). */
  unidad?: string;
  /** Texto corto del chip en la lista y en facturacion. "" = no se dibuja chip. */
  chip: (valor: string) => string;
  /** Clases del chip. Van completas porque Tailwind no arma nombres de clase al vuelo. */
  chipClase: string;
  /** Total al pie de la columna en el reporte. Recibe solo los valores cargados. */
  resumen: (valores: string[]) => string;
}

const plural = (n: number, singular: string, plural_: string) => (n === 1 ? singular : plural_);

export const CAMPOS_TECNICO: readonly CampoTecnicoDef[] = [
  {
    clave: "tieneMas20Ap",
    etiqueta: "Más de 20 AP",
    ayuda: "Si el predio tiene más de 20 AP.",
    tipo: "opciones",
    opciones: ["SI", "NO"],
    etiquetaOpcion: { SI: "Sí", NO: "No" },
    // La lista lo dibuja con su propio icono violeta, no con un chip de texto.
    chip: () => "",
    chipClase: "bg-violet-50 text-violet-600 border-violet-200",
    resumen: (valores) => {
      const n = valores.filter((v) => v === "SI").length;
      return n ? `${n} con +20 AP` : "";
    },
  },
  {
    clave: "recablear",
    etiqueta: "Recablear",
    ayuda: "Cuántos puntos tuviste que recablear en esta visita.",
    tipo: "opciones",
    opciones: ["1", "2", "3", "4", "5"],
    chip: (v) => `R${v}`,
    chipClase: "bg-cyan-50 text-cyan-700 border-cyan-200",
    resumen: (valores) => {
      const puntos = valores.reduce((s, v) => s + (Number(v) || 0), 0);
      if (!valores.length) return "";
      return `${valores.length} ${plural(valores.length, "predio", "predios")} · ${puntos} ${plural(puntos, "punto", "puntos")}`;
    },
  },
  {
    clave: "apReinstalados",
    etiqueta: "AP reinstalados",
    ayuda: "Cuántos AP tuviste que reinstalar en esta visita. Vacío si no reinstalaste ninguno.",
    tipo: "numero",
    // No es un 1-5 como recablear: un predio puede tener mas de 20 AP (de ahi el
    // campo de arriba), asi que un tope corto dejaria casos afuera.
    max: 99,
    unidad: "AP",
    chip: (v) => `${v} AP`,
    chipClase: "bg-amber-50 text-amber-700 border-amber-200",
    resumen: (valores) => {
      const total = valores.reduce((s, v) => s + (Number(v) || 0), 0);
      if (!valores.length) return "";
      return `${valores.length} ${plural(valores.length, "predio", "predios")} · ${total} AP`;
    },
  },
  {
    clave: "cambioRack",
    etiqueta: "Cambio de rack",
    ayuda: "Si tuviste que cambiar el rack, y de qué tamaño es el que dejaste.",
    tipo: "opciones",
    opciones: ["CHICO", "GRANDE", "NO"],
    etiquetaOpcion: { CHICO: "Chico", GRANDE: "Grande", NO: "No" },
    chip: (v) => (v === "NO" ? "" : `Rack ${v === "CHICO" ? "chico" : "grande"}`),
    chipClase: "bg-sky-50 text-sky-700 border-sky-200",
    resumen: (valores) => {
      const chicos = valores.filter((v) => v === "CHICO").length;
      const grandes = valores.filter((v) => v === "GRANDE").length;
      const partes = [chicos ? `${chicos} chico${chicos === 1 ? "" : "s"}` : "", grandes ? `${grandes} grande${grandes === 1 ? "" : "s"}` : ""];
      return partes.filter(Boolean).join(" · ");
    },
  },
] as const;

const POR_CLAVE = new Map(CAMPOS_TECNICO.map((c) => [c.clave, c]));

/** La definicion de un campo del tecnico, o undefined si la clave no es de ellos. */
export function campoTecnico(clave: string): CampoTecnicoDef | undefined {
  return POR_CLAVE.get(clave);
}

/** Claves de `camposExtra` que puede tocar un tecnico. El resto sigue siendo solo-admin. */
export const CAMPOS_EXTRA_TECNICO = CAMPOS_TECNICO.map((c) => c.clave) as readonly string[];

/**
 * Deja el valor en su forma canonica, o null si no sirve.
 *
 * Las opciones se comparan en mayusculas para aceptar lo que escriba una importacion
 * ("si", "Chico"), pero se guarda siempre la forma del registro: el chip, el filtro y
 * el reporte leen todos el mismo texto.
 */
export function normalizarCampoTecnico(clave: string, valor: unknown): unknown {
  const def = POR_CLAVE.get(clave);
  if (!def) return valor;
  const v = String(valor ?? "").trim();
  if (!v) return null;

  if (def.tipo === "opciones") {
    const buscado = v.toUpperCase();
    return (def.opciones ?? []).find((o) => o.toUpperCase() === buscado) ?? null;
  }

  // "numero": entero de 1 al tope. Descarta decimales, negativos y el 0 — si no hizo
  // ninguno, el campo va vacio y no en cero.
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= (def.max ?? 99) ? String(n) : null;
}

/** true si el valor recibido es aceptable para esa clave (se usa al validar el PATCH). */
export function valorValidoParaCampo(clave: string, valor: unknown): boolean {
  if (valor === null || valor === "") return true; // borrar siempre se permite
  if (!POR_CLAVE.has(clave)) return false;
  return normalizarCampoTecnico(clave, valor) !== null;
}

/** El valor guardado de un campo, ya normalizado, o "" si no hay nada cargado. */
export function valorCampoTecnico(camposExtra: unknown, clave: string): string {
  if (!camposExtra || typeof camposExtra !== "object") return "";
  const bruto = (camposExtra as Record<string, unknown>)[clave];
  return String(normalizarCampoTecnico(clave, bruto) ?? "");
}

/** Como se muestra un valor: la etiqueta de la opcion, o el valor tal cual. */
export function mostrarValorCampo(def: CampoTecnicoDef, valor: string): string {
  if (!valor) return "";
  return def.etiquetaOpcion?.[valor] ?? valor;
}

/* ── Compatibilidad: helpers que ya usaban otros modulos ──────────────── */

export const CAMPO_MAS_20_AP = "tieneMas20Ap";
export const CAMPO_RECABLEAR = "recablear";
export const CAMPO_AP_REINSTALADOS = "apReinstalados";
export const CAMPO_CAMBIO_RACK = "cambioRack";
export const OPCIONES_RECABLEAR = ["1", "2", "3", "4", "5"] as const;

export function normalizarMas20Ap(valor: unknown): "SI" | "NO" | null {
  return (normalizarCampoTecnico(CAMPO_MAS_20_AP, valor) as "SI" | "NO" | null) ?? null;
}

export function normalizarRecablear(valor: unknown): string | null {
  return (normalizarCampoTecnico(CAMPO_RECABLEAR, valor) as string | null) ?? null;
}

export function normalizarApReinstalados(valor: unknown): string | null {
  return (normalizarCampoTecnico(CAMPO_AP_REINSTALADOS, valor) as string | null) ?? null;
}

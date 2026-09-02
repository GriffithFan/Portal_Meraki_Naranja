import { prisma } from "@/lib/prisma";
// (resolverPredioPorNombre se usa también desde el endpoint de subida)
import {
  elegirTecnicoAcreditado,
  resolveEquipoKey,
  normalizeAssigneeName,
} from "@/utils/equipoUtils";

/**
 * Filtros de la sección Actas, compartidos por la lista, los contadores y la descarga
 * en lote. Están acá y no en cada endpoint para que los tres devuelvan exactamente el
 * mismo conjunto: si el ZIP trajera algo distinto de lo que muestra la pantalla, el
 * filtro deja de ser confiable.
 */
/**
 * Los estados con los que se trabaja día a día. Son los chips de arriba de la lista:
 * un clic en vez de abrir un menú, porque son casi todas las consultas reales.
 */
export const ESTADOS_CHIP = ["SIN ASIGNAR", "NO CONFORME", "CONFORME"];

export interface FiltrosActas {
  buscar?: string | null;
  predioId?: string | null;
  espacioId?: string | null;
  provincia?: string | null;
  /** Nombres de estado del predio, ej. ["SIN ASIGNAR", "NO CONFORME"]. */
  estados?: string[];
  /** Equipo/técnico acreditado (mergeKey de equipoUtils), no un userId suelto. */
  tecnico?: string | null;
  desde?: string | null;
  hasta?: string | null;
  /** true = solo las actas que no pudieron enlazarse a ningún predio. */
  soloHuerfanas?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Predios cuyo técnico ACREDITADO es el equipo pedido.
 *
 * El acreditado es el último asignado, deduplicado por equipo — el mismo criterio del
 * ranking y de facturación. Calcularlo para los 2400 predios en cada request sería
 * caro al pedo, así que primero se recortan los candidatos por índice
 * (`asignaciones.some.userId`, que tiene índice) y recién sobre esos pocos —unos
 * cientos— se resuelve quién quedó acreditado.
 */
async function prediosDelTecnico(mergeKey: string): Promise<string[]> {
  const usuarios = await prisma.user.findMany({
    select: { id: true, nombre: true },
  });
  const delEquipo = usuarios.filter((u) => {
    const k = resolveEquipoKey(u.nombre || "") || normalizeAssigneeName(u.nombre || "") || u.id;
    return k === mergeKey;
  });
  if (!delEquipo.length) return [];

  const candidatos = await prisma.predio.findMany({
    where: {
      asignaciones: {
        some: { userId: { in: delEquipo.map((u) => u.id) }, tipo: { in: ["TAREA", "TECNICO"] } },
      },
    },
    select: {
      id: true,
      asignaciones: {
        where: { tipo: { in: ["TAREA", "TECNICO"] } },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          usuario: { select: { id: true, nombre: true, rol: true, activo: true } },
        },
      },
    },
  });

  return candidatos
    .filter((p) => elegirTecnicoAcreditado(p.asignaciones)?.mergeKey === mergeKey)
    .map((p) => p.id);
}

/** Cache corta: al clickear chips se repite el mismo cálculo varias veces seguidas. */
const cacheTecnico = new Map<string, { ids: string[]; hasta: number }>();
const TTL_MS = 60_000;

export async function predioIdsDeTecnico(mergeKey: string): Promise<string[]> {
  const hit = cacheTecnico.get(mergeKey);
  if (hit && hit.hasta > Date.now()) return hit.ids;
  const ids = await prediosDelTecnico(mergeKey);
  cacheTecnico.set(mergeKey, { ids, hasta: Date.now() + TTL_MS });
  return ids;
}

/**
 * Traduce los filtros a un `where` de Prisma. Todo se resuelve en la base: nada de
 * traer filas para descartarlas después en Node.
 */
export async function construirWhereActas(f: FiltrosActas): Promise<any> {
  const where: any = {};

  if (f.predioId) where.predioId = f.predioId;

  if (f.buscar) {
    where.OR = [
      { nombre: { contains: f.buscar, mode: "insensitive" } },
      { descripcion: { contains: f.buscar, mode: "insensitive" } },
      { archivoNombre: { contains: f.buscar, mode: "insensitive" } },
      { predio: { nombre: { contains: f.buscar, mode: "insensitive" } } },
    ];
  }

  if (f.desde || f.hasta) {
    where.createdAt = {};
    if (f.desde) where.createdAt.gte = new Date(f.desde);
    if (f.hasta) {
      const h = new Date(f.hasta);
      h.setHours(23, 59, 59, 999);
      where.createdAt.lte = h;
    }
  }

  if (f.soloHuerfanas) {
    where.predioId = null;
    return where;
  }

  // Todo lo que sigue vive en el predio, así que necesita el acta enlazada.
  const predio: any = {};
  if (f.estados?.length) predio.estado = { nombre: { in: f.estados } };
  if (f.espacioId) predio.espacioId = f.espacioId;
  if (f.provincia) predio.provincia = { equals: f.provincia, mode: "insensitive" };
  if (Object.keys(predio).length) where.predio = predio;

  if (f.tecnico) {
    const ids = await predioIdsDeTecnico(f.tecnico);
    // Sin predios del técnico, ninguna acta corresponde: un `in: []` devuelve vacío
    // sin ir a buscar nada.
    where.predioId = ids.length ? { in: ids } : { in: ["__ninguno__"] };
  }

  return where;
}

/**
 * Técnicos para el desplegable, agrupados por equipo.
 *
 * Va acá y no contra /api/usuarios porque ese endpoint pide moderador o admin, y un
 * técnico también tiene que poder filtrar. Se agrupa por `mergeKey` para que los que
 * comparten TH —Vinti y Avola bajo el TH09 de Maioli, por ejemplo— aparezcan una vez.
 */
export async function listaTecnicos(): Promise<{ valor: string; nombre: string }[]> {
  const usuarios = await prisma.user.findMany({
    where: { rol: "TECNICO" },
    select: { id: true, nombre: true, activo: true },
    orderBy: { nombre: "asc" },
  });
  const vistos = new Map<string, string>();
  for (const u of usuarios) {
    const nombre = u.nombre || "";
    const key = resolveEquipoKey(nombre) || normalizeAssigneeName(nombre) || u.id;
    if (!vistos.has(key)) vistos.set(key, nombre);
  }
  return Array.from(vistos, ([valor, nombre]) => ({ valor, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Predio al que pertenece un acta según su nombre.
 *
 * El nombre es el número de predio, en dos formatos según por dónde entró: "300042"
 * (lo que escribe el endpoint de generación) y "Acta_300042" (la carga a mano). Se
 * compara por los dígitos para que den lo mismo. Sin esto, cada acta subida a mano
 * volvería a nacer sin enlace y el filtro por técnico se iría desactualizando solo.
 */
export async function resolverPredioPorNombre(nombre: string): Promise<string | null> {
  const codigo = String(nombre || "").replace(/\D/g, "");
  if (codigo.length < 5) return null;
  const predio = await prisma.predio.findFirst({
    where: { codigo },
    select: { id: true },
  });
  return predio?.id ?? null;
}

/** Lee los filtros de la query string, con los nombres que usa el front. */
export function filtrosDesdeParams(params: URLSearchParams, buscar?: string | null): FiltrosActas {
  const estados = (params.get("estados") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    buscar: buscar ?? null,
    predioId: params.get("predioId"),
    espacioId: params.get("espacioId"),
    provincia: params.get("provincia"),
    estados,
    tecnico: params.get("tecnico"),
    desde: params.get("desde"),
    hasta: params.get("hasta"),
    soloHuerfanas: params.get("huerfanas") === "1",
  };
}

/**
 * Campos que la lista realmente dibuja. Quedan afuera `archivoRuta` (la descarga usa
 * el id, no la ruta —y publicarla no aporta nada—), `subidoPorId`, `predioId` y
 * `updatedAt`, que viajaban en cada fila sin que la pantalla los use.
 *
 * El ahorro grande igual no es este sino la paginación: antes se traían 500 filas de
 * entrada y 3000 al buscar.
 */
export const SELECT_LISTA = {
  id: true,
  nombre: true,
  descripcion: true,
  archivoNombre: true,
  archivoTipo: true,
  archivoSize: true,
  version: true,
  createdAt: true,
  subidoPor: { select: { nombre: true } },
  predio: {
    select: {
      id: true,
      codigo: true,
      nombre: true,
      provincia: true,
      estado: { select: { nombre: true } },
    },
  },
} as const;

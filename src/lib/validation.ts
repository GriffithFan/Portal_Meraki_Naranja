import { z, ZodSchema } from "zod";
import { NextResponse } from "next/server";

/* ── Helpers ────────────────────────────────────────────── */

/** Parsea y valida el body JSON contra un schema Zod. Retorna data o NextResponse con error 400. */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return NextResponse.json({ error: "Datos inválidos", detalles: issues }, { status: 400 });
  }
  return result.data;
}

/** Type guard: true si parseBody devolvió un NextResponse (error) */
export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/* ── Primitivos reutilizables ───────────────────────────── */

const str = (max = 500) => z.string().max(max).trim();
const strOpt = (max = 500) => str(max).optional();
const cuid = () => z.string().min(1).max(30);
const cuidOpt = () => cuid().optional().nullable().or(z.literal(""));
const dateStr = () => z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Formato de fecha inválido");
const dateStrOpt = () => dateStr().optional().or(z.literal(""));
const timeStr = () => z.string().regex(/^\d{2}:\d{2}/, "Formato de hora inválido");
const timeStrOpt = () => timeStr().optional().or(z.literal(""));
const boolOpt = () => z.boolean().optional();

const ROLES = ["ADMIN", "MODERADOR", "TECNICO"] as const;
const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"] as const;
const CATEGORIAS_CALENDARIO = ["GENERAL", "INSTALACION", "MANTENIMIENTO", "REUNION", "VISITA", "GUARDIA", "RECORDATORIO", "OTRO"] as const;

/* ── Schemas de API ─────────────────────────────────────── */

// POST /api/auth/login
export const loginSchema = z.object({
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(1, "Contraseña requerida").max(128),
});

// PATCH /api/usuarios
export const updateRolSchema = z.object({
  userId: cuid(),
  rol: z.enum(ROLES),
});

// POST /api/calendario
export const calendarioCreateSchema = z.object({
  titulo: str(200).min(1, "Título requerido"),
  descripcion: strOpt(2000).or(z.literal("")),
  fecha: dateStr(),
  fechaFin: dateStrOpt(),
  horaInicio: timeStrOpt(),
  hora: timeStrOpt(),
  horaFin: timeStrOpt(),
  tipo: strOpt(50),
  categoria: z.enum(CATEGORIAS_CALENDARIO).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  color: strOpt(20),
  todoElDia: boolOpt(),
  ubicacion: strOpt(500),
  notas: strOpt(2000),
  asignadoId: cuidOpt(),
  predioId: cuidOpt(),
  notificarPush: boolOpt(),
});

// PUT /api/calendario/[id]
export const calendarioUpdateSchema = calendarioCreateSchema.partial().extend({
  completada: boolOpt(),
});

// POST /api/stock
export const stockCreateSchema = z.object({
  nombre: str(200).min(1, "Nombre requerido"),
  descripcion: strOpt(2000),
  numeroSerie: strOpt(100),
  modelo: strOpt(100),
  marca: strOpt(100),
  cantidad: z.union([z.number().int().min(0).max(99999), z.string().regex(/^\d+$/)]).optional(),
  estado: strOpt(50),
  categoria: strOpt(100),
  ubicacion: strOpt(500),
  predioId: cuidOpt(),
  notas: strOpt(2000),
  fecha: strOpt(100),
  asignadoId: cuidOpt(),
  etiqueta: strOpt(50),
  etiquetaColor: strOpt(20),
  proveedor: strOpt(50),
});

// PUT /api/stock/[id]
export const stockUpdateSchema = stockCreateSchema.partial();

// POST /api/comentarios
export const comentarioSchema = z.object({
  contenido: str(5000).min(1, "El comentario no puede estar vacío"),
  predioId: cuidOpt(),
  equipoId: cuidOpt(),
}).refine((d) => d.predioId || d.equipoId, {
  message: "Se requiere predioId o equipoId",
});

// POST /api/delegaciones
export const delegacionSchema = z.object({
  delegadorId: cuid(),
  delegadoId: cuid(),
  notas: strOpt(1000),
}).refine((d) => d.delegadorId !== d.delegadoId, {
  message: "No se puede delegar a sí mismo",
});

// PUT /api/notificaciones
export const notificacionMarcarSchema = z.object({
  ids: z.array(cuid()).max(200).optional(),
  marcarTodas: boolOpt(),
});

// POST /api/notificaciones
export const notificacionCrearSchema = z.object({
  tipo: strOpt(50),
  titulo: str(200).min(1, "Título requerido"),
  mensaje: str(2000).min(1, "Mensaje requerido"),
  userIds: z.array(cuid()).min(1, "Se requiere al menos un destinatario").max(200),
  enlace: strOpt(500),
});

// POST /api/espacios
export const espacioSchema = z.object({
  nombre: str(200).min(1, "Nombre requerido"),
  descripcion: strOpt(1000),
  color: strOpt(20),
  icono: strOpt(50),
  parentId: cuidOpt(),
});

// PUT /api/permisos
export const permisosSchema = z.object({
  permisos: z.array(z.object({
    seccion: str(50),
    rol: z.enum(ROLES),
    ver: z.boolean(),
    crear: z.boolean().optional().default(false),
    editar: z.boolean(),
    eliminar: z.boolean().optional().default(false),
    exportar: z.boolean().optional().default(false),
  })).min(1).max(200),
});

// POST /api/tareas (campos principales)
export const tareaCreateSchema = z.object({
  nombre: str(200).min(1, "Nombre requerido"),
  codigo: strOpt(50),
  direccion: strOpt(500),
  ciudad: strOpt(200),
  tipo: strOpt(50),
  notas: strOpt(5000),
  prioridad: z.enum(PRIORIDADES).optional(),
  asignadoIds: z.array(cuid()).max(50).optional(),
  fechaProgramada: strOpt(100),
  estadoId: cuidOpt(),
  espacioId: cuidOpt(),
  incidencias: strOpt(5000),
  lacR: strOpt(100),
  cue: strOpt(100),
  ambito: strOpt(100),
  equipoAsignado: strOpt(200),
  provincia: strOpt(200),
  cuePredio: strOpt(100),
  gpsPredio: strOpt(200),
  fechaDesde: strOpt(100),
  fechaHasta: strOpt(100),
});

// PATCH /api/tareas/[id]
export const tareaUpdateSchema = tareaCreateSchema
  .extend({
    seccion: strOpt(100),
    latitud: z.union([z.number(), z.string(), z.null()]).optional(),
    longitud: z.union([z.number(), z.string(), z.null()]).optional(),
    camposExtra: z.record(z.string(), z.unknown()).optional(),
  })
  .partial();

// POST /api/importar/ejecutar
export const importarEjecutarSchema = z.object({
  tipo: z.enum(["PREDIO", "EQUIPO"]),
  mappings: z.array(z.object({
    excelColumn: z.number().int().min(0),
    dbField: z.string().max(50),
  })).min(1).max(50),
  rows: z.array(z.array(z.string().max(2000))).min(1).max(5000),
  defaultPrioridad: z.enum(PRIORIDADES).optional(),
  defaultEstadoId: cuidOpt(),
  espacioId: cuidOpt(),
  updateExisting: z.boolean().optional(),
});

// POST /api/facturacion (body opcional)
export const facturacionSchema = z.object({
  fechaDesde: strOpt(100),
  fechaHasta: strOpt(100),
}).optional().default({});

// POST /api/estados
export const estadoCreateSchema = z.object({
  nombre: str(100).min(1, "Nombre requerido"),
  color: strOpt(20),
  entidad: z.enum(["PREDIO", "EQUIPO"]).optional(),
});

// POST /api/push/subscribe
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url("Endpoint inválido").max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

// DELETE /api/push/subscribe
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url("Endpoint inválido").max(2000),
});

// PATCH /api/espacios/[id]
export const espacioUpdateSchema = z.object({
  nombre: strOpt(200),
  descripcion: strOpt(1000),
  color: strOpt(20),
  icono: strOpt(50),
  orden: z.number().int().min(0).max(9999).optional(),
  activo: boolOpt(),
});

// PUT /api/calendario/[id] — rama asignatario (solo completada)
export const calendarioCompletarSchema = z.object({
  completada: z.boolean(),
});

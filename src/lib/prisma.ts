import { PrismaClient } from "@prisma/client";
import { getAuditActor } from "@/lib/auditContext";
import "@/lib/errorLog"; // registra handlers globales de errores (side-effect)

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Auditoría automática de modificaciones ──
const WRITE_OPS = new Set(["create", "update", "delete", "upsert", "createMany", "updateMany", "deleteMany"]);
// Modelos que NO se auditan por el interceptor:
//  - tablas de auditoría/sesión/config de alto volumen y chat (ruido);
//  - Predio/Equipo/Asignacion/PredioEtiqueta/Comentario: se escriben en bucle
//    durante las importaciones (inundarían el log y cargarían la BD) y YA se
//    registran con sus propios logs de actividad — siguen auditados por esa vía.
const EXCLUDED_MODELS = new Set([
  "Actividad", "RegistroAcceso", "ConfiguracionVista", "Notificacion", "PushSubscription",
  "AnuncioLectura", "ChatConversacion", "ChatMensaje", "ChatMensajeReaction",
  "JornadaLaboral", "MonitoreoPostCambio", "ErrorLog",
  "Predio", "Equipo", "Asignacion", "PredioEtiqueta", "Comentario",
]);
const ACCION: Record<string, string> = {
  create: "CREAR", createMany: "CREAR", update: "EDITAR", updateMany: "EDITAR",
  upsert: "EDITAR", delete: "ELIMINAR", deleteMany: "ELIMINAR",
};
const VERBO: Record<string, string> = { CREAR: "Creó", EDITAR: "Editó", ELIMINAR: "Eliminó" };
const LABEL: Record<string, string> = {
  User: "Usuario", Predio: "Predio/Tarea", Equipo: "Equipo (stock)", EspacioTrabajo: "Espacio/Carpeta",
  EstadoConfig: "Estado", CampoPersonalizado: "Campo personalizado", PermisoSeccion: "Permiso de sección (rol)",
  PermisoEstado: "Visibilidad de estado (rol)", PermisoSeccionUsuario: "Permiso de sección (usuario)",
  PermisoEstadoUsuario: "Visibilidad de estado (usuario)", Asignacion: "Asignación", Etiqueta: "Etiqueta",
  PredioEtiqueta: "Etiqueta de predio", Comentario: "Comentario", TareaCalendario: "Tarea de calendario",
  Instructivo: "Instructivo", Acta: "Acta", Hospedaje: "Hospedaje", Anuncio: "Anuncio",
  Delegacion: "Delegación", AccesoEspacio: "Acceso a espacio", AccesoEspacioRol: "Acceso a espacio (rol)",
  FichaPersonal: "Ficha de personal", FichaArchivo: "Archivo de personal", ReporteFacturacion: "Reporte de facturación",
  PapeleraItem: "Papelera",
};

function createExtended(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const result = await query(args);
          // El registro de auditoría NUNCA debe afectar la operación principal.
          try {
            if (model && WRITE_OPS.has(operation) && !EXCLUDED_MODELS.has(model)) {
              const actor = getAuditActor();
              if (actor?.userId) {
                const accion = ACCION[operation];
                const esBulk = operation === "createMany" || operation === "updateMany" || operation === "deleteMany";
                const r: any = result;
                const a: any = args || {};
                let entidadId = "";
                if (esBulk) entidadId = "(varios)";
                else if (r && typeof r === "object" && r.id != null) entidadId = String(r.id);
                else if (a.where && a.where.id != null) entidadId = String(a.where.id);

                const meta: any = { op: operation };
                if (a.where && typeof a.where === "object") meta.where = a.where;
                const d = a.data;
                if (d && typeof d === "object") meta.campos = Object.keys(Array.isArray(d) ? (d[0] || {}) : d);
                if (r && typeof r === "object" && typeof r.count === "number") meta.count = r.count;

                const label = LABEL[model] || model;
                const descripcion = `${VERBO[accion] || accion} ${label}${meta.count != null ? ` (${meta.count})` : ""}`;

                base.actividad.create({
                  data: { accion, descripcion, entidad: model, entidadId, metadata: meta, userId: actor.userId },
                }).catch(() => { /* no bloquear ni romper por el log */ });
              }
            }
          } catch { /* nunca propagar errores de auditoría */ }
          return result;
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createExtended>;

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient; prisma?: ExtendedClient };

// Cliente base (sin interceptor) — se usa para escribir los registros de
// auditoría sin volver a dispararse a sí mismo.
const basePrisma = globalForPrisma.prismaBase ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = basePrisma;

export const prisma = globalForPrisma.prisma ?? createExtended(basePrisma);
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

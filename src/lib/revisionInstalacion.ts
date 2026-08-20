import { prisma } from "@/lib/prisma";

/**
 * Circuito automatico de REVISION INSTALACION.
 *
 * El estado se llena solo: los tecnicos mandan predios ahi desde el campo y despues
 * hay que buscarlos a mano por todas las carpetas (paso el 20/08/2026: 9 predios
 * repartidos en ER 2026, PBA y SF 2026, todavia asignados a quien los mando).
 *
 * Con esto, apenas un predio entra al estado cae en la carpeta "inbox" y se le
 * quitan los tecnicos, para que quede en una sola pila esperando triage. Los que ya
 * estan en una carpeta del circuito (`rolRevision` no nulo) no se tocan: si alguien
 * ya lo clasifico en Reinstalar / Reinstalacion Facil, se queda donde esta.
 *
 * Se llama fire-and-forget desde los endpoints que cambian estado; si falla, el
 * cambio de estado igual queda hecho.
 */
export const CLAVE_REVISION = "revision_instalacion";

/** Carpeta donde caen los predios sin clasificar. La marca la lleva la carpeta, no el codigo. */
async function carpetaInbox() {
  return prisma.espacioTrabajo.findFirst({
    where: { rolRevision: "inbox", activo: true },
    select: { id: true, nombre: true },
  });
}

export async function derivarARevisionInstalacion(predioIds: string[], actorId: string) {
  if (predioIds.length === 0) return { movidos: 0 };

  const inbox = await carpetaInbox();
  if (!inbox) return { movidos: 0 }; // sin carpeta marcada, el automatismo esta apagado

  const estado = await prisma.estadoConfig.findFirst({
    where: { clave: CLAVE_REVISION },
    select: { id: true },
  });
  if (!estado) return { movidos: 0 };

  // Solo los que quedaron efectivamente en el estado y NO estan ya en una carpeta
  // del circuito (inbox o ya clasificada).
  const candidatos = await prisma.predio.findMany({
    where: {
      id: { in: predioIds },
      estadoId: estado.id,
      OR: [{ espacioId: null }, { espacio: { rolRevision: null } }],
    },
    select: { id: true, codigo: true, espacio: { select: { nombre: true } } },
  });
  if (candidatos.length === 0) return { movidos: 0 };

  const ids = candidatos.map((p) => p.id);
  await prisma.predio.updateMany({ where: { id: { in: ids } }, data: { espacioId: inbox.id } });
  await prisma.asignacion.deleteMany({
    where: { predioId: { in: ids }, tipo: { in: ["TAREA", "TECNICO"] } },
  });
  await prisma.actividad.createMany({
    data: candidatos.map((p) => ({
      accion: "EDITAR",
      descripcion: `Pasó a REVISIÓN INSTALACIÓN: movido de "${p.espacio?.nombre || "sin carpeta"}" a "${inbox.nombre}" y desasignado`,
      entidad: "PREDIO",
      entidadId: p.id,
      userId: actorId,
      metadata: { automatico: "revision-instalacion", desde: p.espacio?.nombre || null },
    })),
  }).catch(() => {});

  return { movidos: candidatos.length, carpeta: inbox.nombre };
}

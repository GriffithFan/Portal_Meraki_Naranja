// Script: Create Gustavo user and migrate all Th05 references
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const TH05_EMAIL = "th05@thnet.com";
const GUSTAVO_EMAIL = "gustavo@thnet.com";
const GUSTAVO_HASH = "$2b$12$h0vRMbzpL/BdIi0BHmeeGuEhOWParBCIkTF49S8Yp21RWGMujBHhO";

async function main() {
  // 1. Find Th05
  const th05 = await prisma.user.findUnique({ where: { email: TH05_EMAIL } });
  if (!th05) {
    console.error("ERROR: No se encontró usuario con email", TH05_EMAIL);
    // Try to find by name pattern
    const candidates = await prisma.user.findMany({ where: { nombre: { contains: "Th05", mode: "insensitive" } } });
    if (candidates.length) {
      console.log("Candidatos encontrados:", candidates.map(c => `${c.id} - ${c.nombre} - ${c.email}`));
    }
    process.exit(1);
  }
  console.log(`Found Th05: id=${th05.id}, nombre=${th05.nombre}, email=${th05.email}, rol=${th05.rol}, esMesa=${th05.esMesa}`);

  // 2. Create Gustavo with same role/permissions as Th05
  const gustavo = await prisma.user.upsert({
    where: { email: GUSTAVO_EMAIL },
    update: {},  // Don't overwrite if already exists
    create: {
      nombre: "Gustavo",
      email: GUSTAVO_EMAIL,
      password: GUSTAVO_HASH,
      rol: th05.rol,
      esMesa: th05.esMesa,
      activo: true,
      telefono: th05.telefono,
    },
  });
  console.log(`Gustavo: id=${gustavo.id}, email=${gustavo.email}, rol=${gustavo.rol}`);

  const th05Id = th05.id;
  const gustavoId = gustavo.id;

  // 3. Migrate all relations

  // Asignaciones (userId)
  const r1 = await prisma.asignacion.updateMany({ where: { userId: th05Id }, data: { userId: gustavoId } });
  console.log(`Asignaciones migradas: ${r1.count}`);

  // TareaCalendario - creadorId
  const r2 = await prisma.tareaCalendario.updateMany({ where: { creadorId: th05Id }, data: { creadorId: gustavoId } });
  console.log(`Tareas (creador) migradas: ${r2.count}`);

  // TareaCalendario - asignadoId
  const r3 = await prisma.tareaCalendario.updateMany({ where: { asignadoId: th05Id }, data: { asignadoId: gustavoId } });
  console.log(`Tareas (asignado) migradas: ${r3.count}`);

  // Comentarios
  const r4 = await prisma.comentario.updateMany({ where: { userId: th05Id }, data: { userId: gustavoId } });
  console.log(`Comentarios migrados: ${r4.count}`);

  // Actividades
  const r5 = await prisma.actividad.updateMany({ where: { userId: th05Id }, data: { userId: gustavoId } });
  console.log(`Actividades migradas: ${r5.count}`);

  // Notificaciones
  const r6 = await prisma.notificacion.updateMany({ where: { userId: th05Id }, data: { userId: gustavoId } });
  console.log(`Notificaciones migradas: ${r6.count}`);

  // Predios (creadorId)
  const r7 = await prisma.predio.updateMany({ where: { creadorId: th05Id }, data: { creadorId: gustavoId } });
  console.log(`Predios (creador) migrados: ${r7.count}`);

  // Instructivos (creadoPorId)
  const r8 = await prisma.instructivo.updateMany({ where: { creadoPorId: th05Id }, data: { creadoPorId: gustavoId } });
  console.log(`Instructivos migrados: ${r8.count}`);

  // Actas (subidoPorId)
  const r9 = await prisma.acta.updateMany({ where: { subidoPorId: th05Id }, data: { subidoPorId: gustavoId } });
  console.log(`Actas migradas: ${r9.count}`);

  // Espacios de trabajo (creadorId)
  const r10 = await prisma.espacioTrabajo.updateMany({ where: { creadorId: th05Id }, data: { creadorId: gustavoId } });
  console.log(`Espacios de trabajo migrados: ${r10.count}`);

  // Monitoreos
  const r11 = await prisma.monitoreoPostCambio.updateMany({ where: { userId: th05Id }, data: { userId: gustavoId } });
  console.log(`Monitoreos migrados: ${r11.count}`);

  // PushSubscriptions
  const r12 = await prisma.pushSubscription.updateMany({ where: { userId: th05Id }, data: { userId: gustavoId } });
  console.log(`PushSubscriptions migradas: ${r12.count}`);

  // Delegaciones (como delegador)
  const r13 = await prisma.delegacion.updateMany({ where: { delegadorId: th05Id }, data: { delegadorId: gustavoId } });
  console.log(`Delegaciones (delegador) migradas: ${r13.count}`);

  // Delegaciones (como delegado)
  const r14 = await prisma.delegacion.updateMany({ where: { delegadoId: th05Id }, data: { delegadoId: gustavoId } });
  console.log(`Delegaciones (delegado) migradas: ${r14.count}`);

  // ReporteFacturacion (generadoPorId)
  const r15 = await prisma.reporteFacturacion.updateMany({ where: { generadoPorId: th05Id }, data: { generadoPorId: gustavoId } });
  console.log(`Reportes facturación migrados: ${r15.count}`);

  // PapeleraItem (eliminadoPorId)
  const r16 = await prisma.papeleraItem.updateMany({ where: { eliminadoPorId: th05Id }, data: { eliminadoPorId: gustavoId } });
  console.log(`Papelera items migrados: ${r16.count}`);

  // ChatConversacion (como creador)
  const r17 = await prisma.chatConversacion.updateMany({ where: { creadorId: th05Id }, data: { creadorId: gustavoId } });
  console.log(`Chats (creador) migrados: ${r17.count}`);

  // ChatConversacion (como agente)
  const r18 = await prisma.chatConversacion.updateMany({ where: { agenteId: th05Id }, data: { agenteId: gustavoId } });
  console.log(`Chats (agente) migrados: ${r18.count}`);

  // ChatMensaje (autorId)
  const r19 = await prisma.chatMensaje.updateMany({ where: { autorId: th05Id }, data: { autorId: gustavoId } });
  console.log(`Mensajes chat migrados: ${r19.count}`);

  // Equipos (asignadoId)
  const r20 = await prisma.equipo.updateMany({ where: { asignadoId: th05Id }, data: { asignadoId: gustavoId } });
  console.log(`Equipos migrados: ${r20.count}`);

  // PermisoEstadoUsuario
  // Need to handle unique constraint (estadoId, userId) — first delete any existing Gustavo entries
  const existingPermisos = await prisma.permisoEstadoUsuario.findMany({ where: { userId: th05Id } });
  for (const p of existingPermisos) {
    await prisma.permisoEstadoUsuario.upsert({
      where: { estadoId_userId: { estadoId: p.estadoId, userId: gustavoId } },
      update: { visible: p.visible },
      create: { estadoId: p.estadoId, userId: gustavoId, visible: p.visible },
    });
  }
  await prisma.permisoEstadoUsuario.deleteMany({ where: { userId: th05Id } });
  console.log(`PermisoEstadoUsuario migrados: ${existingPermisos.length}`);

  // AccesoEspacio (unique constraint userId + espacioId)
  const existingAccesos = await prisma.accesoEspacio.findMany({ where: { userId: th05Id } });
  for (const a of existingAccesos) {
    await prisma.accesoEspacio.upsert({
      where: { userId_espacioId: { userId: gustavoId, espacioId: a.espacioId } },
      update: {},
      create: { userId: gustavoId, espacioId: a.espacioId },
    });
  }
  await prisma.accesoEspacio.deleteMany({ where: { userId: th05Id } });
  console.log(`AccesoEspacio migrados: ${existingAccesos.length}`);

  // RegistroAcceso — keep historical as-is (audit trail shouldn't be migrated)
  // But count them for reference
  const regCount = await prisma.registroAcceso.count({ where: { userId: th05Id } });
  console.log(`RegistroAcceso de Th05 (NO migrados, es auditoría): ${regCount}`);

  console.log("\n=== MIGRACIÓN COMPLETA ===");
  console.log(`Th05 (${th05Id}) → Gustavo (${gustavoId})`);
  console.log("Th05 sigue existiendo pero sin asignaciones activas.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

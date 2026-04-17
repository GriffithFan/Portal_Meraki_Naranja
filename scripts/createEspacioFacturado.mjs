/**
 * Crea el espacio raíz "Facturado" para mover predios ya facturados.
 * Solo visible para ADMIN. Se ejecuta una sola vez.
 *
 * Uso: node scripts/createEspacioFacturado.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Verificar si ya existe
  const existing = await prisma.espacioTrabajo.findFirst({
    where: { nombre: "Facturado", parentId: null },
  });

  if (existing) {
    console.log(`✓ El espacio "Facturado" ya existe con ID: ${existing.id}`);
    return;
  }

  // Buscar un admin para asignar como creador
  const admin = await prisma.user.findFirst({
    where: { rol: "ADMIN", activo: true },
  });

  if (!admin) {
    console.error("✗ No se encontró un usuario ADMIN activo");
    process.exit(1);
  }

  // Obtener max orden
  const maxOrden = await prisma.espacioTrabajo.aggregate({
    _max: { orden: true },
    where: { parentId: null },
  });

  const nuevoOrden = (maxOrden._max.orden || 0) + 1;

  const espacio = await prisma.espacioTrabajo.create({
    data: {
      nombre: "Facturado",
      descripcion: "Predios ya facturados. Solo visible para administradores.",
      color: "#10b981",
      icono: "bolt",
      orden: nuevoOrden,
      parentId: null,
      creadorId: admin.id,
    },
  });

  console.log(`✓ Espacio "Facturado" creado con ID: ${espacio.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

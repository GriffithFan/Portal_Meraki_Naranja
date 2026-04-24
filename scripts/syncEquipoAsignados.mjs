// scripts/syncEquipoAsignados.mjs
// Sincroniza equipoAsignado ↔ Asignacion para todos los predios:
//  - Si un predio tiene equipoAsignado y no tiene Asignacion al user correspondiente → la crea (tipo TECNICO).
//  - Si un predio tiene Asignacion y no tiene equipoAsignado → lo deriva del primer user que matchee una key.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EQUIPOS = [
  { key: "TH01",    aliases: ["DANIEL", "DANI", "DANIEL C01"] },
  { key: "TH02",    aliases: [] },
  { key: "TH03",    aliases: ["JORGE"] },
  { key: "TH04",    aliases: ["LUCIO", "ADOLFO"] },
  { key: "TH05",    aliases: [] },
  { key: "TH06",    aliases: [] },
  { key: "TH07",    aliases: ["FEDE", "FEDERICO"] },
  { key: "TH08",    aliases: [] },
  { key: "TH09",    aliases: [] },
  { key: "TH10",    aliases: [] },
  { key: "Gustavo", aliases: ["GUSTAVO"] },
  { key: "Ariel",   aliases: ["ARIEL", "ARIEL MAIOLI", "A. MAIOLI", "A.MAIOLI", "MAIOLI"] },
  { key: "Julian",  aliases: ["JULIAN", "JULIÁN"] },
];

function norm(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/[\s_-]+/g, " ");
}

const INDEX = new Map();
for (const e of EQUIPOS) {
  INDEX.set(norm(e.key), e);
  for (const a of e.aliases) INDEX.set(norm(a), e);
}

function resolveKey(name) {
  if (!name) return null;
  const e = INDEX.get(norm(name));
  if (e) return e.key;
  const m = String(name).match(/\b(TH\d{1,2})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function variants(name) {
  const e = INDEX.get(norm(name));
  if (!e) return [];
  return [e.key, ...e.aliases];
}

async function main() {
  console.log("\n🔄 Sincronizando equipoAsignado ↔ Asignacion...");

  const users = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
  // Mapa: equipoKey → userId
  const keyToUser = new Map();
  for (const u of users) {
    const k = resolveKey(u.nombre);
    if (k && !keyToUser.has(k)) keyToUser.set(k, u.id);
  }
  console.log(`   Usuarios activos: ${users.length}, mapeados a equipos: ${keyToUser.size}`);

  const predios = await prisma.predio.findMany({
    select: {
      id: true, codigo: true, nombre: true, equipoAsignado: true,
      asignaciones: { select: { userId: true, tipo: true } },
    },
  });
  console.log(`   Predios totales: ${predios.length}`);

  let equipoAAsign = 0;
  let asignAEquipo = 0;

  for (const p of predios) {
    const equipoKey = resolveKey(p.equipoAsignado);

    // 1) equipoAsignado → Asignacion
    if (equipoKey) {
      const targetUserId = keyToUser.get(equipoKey);
      if (targetUserId) {
        const already = p.asignaciones.some((a) => a.userId === targetUserId);
        if (!already) {
          await prisma.asignacion.create({
            data: { tipo: "TECNICO", userId: targetUserId, predioId: p.id },
          });
          equipoAAsign++;
        }
      }
    }

    // 2) Asignacion → equipoAsignado (solo si no hay equipo y SÍ hay asignaciones)
    if (!p.equipoAsignado && p.asignaciones.length > 0) {
      const asignUserIds = p.asignaciones.map((a) => a.userId);
      const asignUsers = users.filter((u) => asignUserIds.includes(u.id));
      let k = null;
      for (const u of asignUsers) {
        k = resolveKey(u.nombre);
        if (k) break;
      }
      if (k) {
        await prisma.predio.update({ where: { id: p.id }, data: { equipoAsignado: k } });
        asignAEquipo++;
      }
    }
  }

  console.log("\n📊 Resumen:");
  console.log(`   Asignaciones creadas desde equipoAsignado: ${equipoAAsign}`);
  console.log(`   equipoAsignado seteado desde Asignacion:   ${asignAEquipo}`);
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

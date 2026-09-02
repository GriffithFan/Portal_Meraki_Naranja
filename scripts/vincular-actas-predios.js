/**
 * Completa el `predioId` de las actas que quedaron sin enlazar.
 *
 * Por que hace falta: el acta y el predio se relacionan por una clave foranea que
 * casi nunca se lleno (174 de 2486). Sin ella no se puede filtrar por tecnico ni por
 * estado, porque esos datos viven en el predio, no en el acta. El unico vinculo real
 * que quedo es el numero de predio escrito en el nombre, en dos formatos segun quien
 * la subio: "300042" (lo que hace el endpoint) y "Acta_300042" (la carga a mano).
 *
 * No toca archivos, ni nombres, ni versiones: solo escribe una columna vacia.
 *
 * Uso (desde /var/www/carrot):
 *   node scripts/vincular-actas-predios.js            # prueba, no escribe
 *   node scripts/vincular-actas-predios.js --aplicar
 *   node scripts/vincular-actas-predios.js --revertir # deshace lo que marco este script
 *
 * El --revertir solo limpia las actas que este script enlazo (quedan marcadas en la
 * Actividad), asi que no puede romper los enlaces que ya venian de antes.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const APLICAR = process.argv.includes("--aplicar");
const REVERTIR = process.argv.includes("--revertir");
const MARCA = "vinculo automatico acta-predio";
const RASTRO = path.join(process.cwd(), "uploads", "actas-vinculadas.json");

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");

(async () => {
  if (REVERTIR) {
    if (!fs.existsSync(RASTRO)) {
      console.log(`No hay rastro de una corrida previa en ${RASTRO}: no hay nada que revertir.`);
      return;
    }
    const { fecha, ids } = JSON.parse(fs.readFileSync(RASTRO, "utf8"));
    console.log(`corrida del ${fecha}: ${ids.length} actas enlazadas por este script`);
    if (!APLICAR) {
      console.log("(prueba: no se escribio nada. Agrega --aplicar para revertir de verdad)");
      return;
    }
    let n = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const r = await prisma.acta.updateMany({
        where: { id: { in: ids.slice(i, i + 500) } }, data: { predioId: null },
      });
      n += r.count;
    }
    console.log(`revertidas: ${n}`);
    return;
  }

  // Solo se traen los campos que hacen falta: con 2486 actas y 2441 predios, traer
  // las filas enteras seria mover ~2 MB para escribir una columna.
  const [actas, predios] = await Promise.all([
    prisma.acta.findMany({ where: { predioId: null }, select: { id: true, nombre: true } }),
    prisma.predio.findMany({ select: { id: true, codigo: true } }),
  ]);

  const porCodigo = new Map();
  for (const p of predios) {
    const c = soloDigitos(p.codigo);
    if (c.length >= 5 && !porCodigo.has(c)) porCodigo.set(c, p.id);
  }

  const aEnlazar = [];
  const huerfanas = [];
  for (const a of actas) {
    const cod = soloDigitos(a.nombre);
    const predioId = cod.length >= 5 ? porCodigo.get(cod) : null;
    if (predioId) aEnlazar.push({ id: a.id, predioId, cod });
    else huerfanas.push(a.nombre);
  }

  const total = await prisma.acta.count();
  const yaEnlazadas = total - actas.length;
  console.log(`actas totales            : ${total}`);
  console.log(`   ya enlazadas          : ${yaEnlazadas}`);
  console.log(`   se enlazan ahora      : ${aEnlazar.length}`);
  console.log(`   quedan sin predio     : ${huerfanas.length}`);
  console.log(`   cobertura final       : ${((100 * (yaEnlazadas + aEnlazar.length)) / total).toFixed(1)}%`);
  if (huerfanas.length) {
    console.log(`\nsin predio en Carrot (primeras 12): ${huerfanas.slice(0, 12).join(", ")}`);
  }

  if (!APLICAR) {
    console.log("\n(prueba: no se escribio nada. Correr con --aplicar)");
    return;
  }

  // Un updateMany por predio: son ~2100 actas sobre ~2100 predios distintos, asi que
  // agrupar por predioId evita 2100 UPDATE de una fila cada uno.
  const porPredio = new Map();
  for (const x of aEnlazar) {
    if (!porPredio.has(x.predioId)) porPredio.set(x.predioId, []);
    porPredio.get(x.predioId).push(x.id);
  }

  let hechas = 0;
  const entradas = [...porPredio.entries()];
  for (let i = 0; i < entradas.length; i += 200) {
    const tanda = entradas.slice(i, i + 200);
    await prisma.$transaction(
      tanda.map(([predioId, ids]) =>
        prisma.acta.updateMany({ where: { id: { in: ids } }, data: { predioId } })
      )
    );
    hechas += tanda.reduce((n, [, ids]) => n + ids.length, 0);
    console.log(`   ... ${hechas}/${aEnlazar.length}`);
  }

  // Rastro para poder revertir: la lista de ids va a un archivo, no a la Actividad.
  // Escribir 2100 filas de historial por una migracion de datos taparia el feed que
  // la gente usa para ver quien toco que.
  fs.writeFileSync(RASTRO, JSON.stringify({
    fecha: new Date().toISOString(),
    ids: aEnlazar.map((x) => x.id),
  }));
  const admin = await prisma.user.findFirst({
    where: { rol: "ADMIN", activo: true }, orderBy: { createdAt: "asc" }, select: { id: true },
  });
  if (admin) {
    await prisma.actividad.create({
      data: {
        accion: "EDITAR",
        descripcion: `${MARCA}: ${hechas} actas enlazadas a su predio`,
        entidad: "ACTA",
        entidadId: "bulk",
        userId: admin.id,
      },
    }).catch(() => {});
  }

  console.log(`\nenlazadas: ${hechas}`);
  console.log(`rastro para revertir: ${RASTRO}`);
  console.log(`actas con predio ahora: ${await prisma.acta.count({ where: { predioId: { not: null } } })}`);
})().catch((e) => { console.log("ERROR", String(e).slice(0, 600)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

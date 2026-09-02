/**
 * Registra en Carrot las actas que dejo `generar_actas_lote.py` en una carpeta.
 *
 * El generador de lote escribe los .docx sueltos en disco; eso alcanza para imprimirlas,
 * pero no aparecen en la seccion Actas. Este script hace lo que hace el endpoint
 * /api/actas/generar por cada archivo: lo copia a uploads/actas y crea el registro
 * `Acta` ligado al predio, con la misma convencion de nombres y rutas.
 *
 * Uso (desde /var/www/carrot, que es donde vive la carpeta uploads):
 *   node scripts/importar-actas-lote.js <carpeta> [--aplicar] [--pisar] [--autor <email>]
 *
 * Sin --aplicar solo muestra lo que haria. Con --pisar reemplaza las actas que ya
 * existan para ese predio (sube la version y borra el archivo viejo); por defecto las
 * saltea, que es la opcion que no pierde nada.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const PISAR = args.includes("--pisar");
const CARPETA = args.find((a) => !a.startsWith("--"));
const AUTOR = (() => {
  const i = args.indexOf("--autor");
  return i >= 0 ? args[i + 1] : null;
})();

/** Establecimiento por predio, del resumen.csv que deja el generador. */
function leerResumen(carpeta) {
  const ruta = path.join(carpeta, "resumen.csv");
  const m = new Map();
  if (!fs.existsSync(ruta)) return m;
  const texto = fs.readFileSync(ruta, "utf8").replace(/^﻿/, "");
  const [, ...filas] = texto.split(/\r?\n/).filter(Boolean);
  for (const f of filas) {
    const [predio, , , establecimiento] = f.split(";");
    if (predio) m.set(predio.trim(), (establecimiento || "").trim());
  }
  return m;
}

/** Mismo formato que usa el endpoint: <epoch>-<6 al azar>.docx */
function nombreSeguro() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.docx`;
}

(async () => {
  if (!CARPETA || !fs.existsSync(CARPETA)) {
    console.log("Falta la carpeta con las actas (o no existe).");
    console.log("Uso: node scripts/importar-actas-lote.js <carpeta> [--aplicar] [--pisar]");
    process.exit(1);
  }

  const archivos = fs.readdirSync(CARPETA)
    .filter((f) => /^Acta_\d+\.docx$/i.test(f))
    .sort();
  if (!archivos.length) {
    console.log(`No hay archivos Acta_<predio>.docx en ${CARPETA}`);
    process.exit(1);
  }

  const autor = AUTOR
    ? await prisma.user.findFirst({ where: { email: AUTOR }, select: { id: true, nombre: true, email: true, rol: true } })
    : await prisma.user.findFirst({ where: { rol: "ADMIN", activo: true }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, email: true, rol: true } });
  if (!autor) {
    console.log("No se encontro un usuario para figurar como quien subio las actas.");
    process.exit(1);
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "actas");
  if (APLICAR) fs.mkdirSync(uploadsDir, { recursive: true });

  const establecimientos = leerResumen(CARPETA);

  // Todo de una: los predios por codigo y las actas que ya existen por nombre.
  const codigos = archivos.map((f) => f.match(/^Acta_(\d+)\.docx$/i)[1]);
  const predios = new Map((await prisma.predio.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true, codigo: true, incidencias: true },
  })).map((p) => [p.codigo, p]));
  // Las actas cargadas a mano se llaman "Acta_<predio>" y las que hace el endpoint,
  // "<predio>" a secas. Comparar el nombre tal cual da por faltante algo que ya esta
  // cargado (y duplica), asi que la comparacion es por el numero que lleva adentro.
  const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
  const yaExisten = new Map();
  for (const a of await prisma.acta.findMany({
    select: { id: true, nombre: true, archivoRuta: true, version: true },
  })) {
    const n = soloDigitos(a.nombre);
    if (n.length >= 5 && !yaExisten.has(n)) yaExisten.set(n, a);
  }

  console.log(`carpeta      : ${CARPETA}`);
  console.log(`archivos     : ${archivos.length}`);
  console.log(`autor        : ${autor.nombre} <${autor.email}> (${autor.rol})`);
  const colisiones = codigos.filter((c) => yaExisten.has(c)).length;
  console.log(`ya en Carrot : ${colisiones}${PISAR ? " (se pisan)" : " (se saltean)"}`);
  console.log(`sin predio en Carrot: ${codigos.filter((c) => !predios.has(c)).length}`);
  console.log(APLICAR ? "\n=== APLICANDO ===\n" : "\n=== PRUEBA (no escribe nada) ===\n");

  let creadas = 0, pisadas = 0, salteadas = 0, fallidas = 0;
  for (const archivo of archivos) {
    const codigo = archivo.match(/^Acta_(\d+)\.docx$/i)[1];
    const previa = yaExisten.get(codigo);
    if (previa && !PISAR) {
      salteadas += 1;
      continue;
    }

    try {
      const origen = path.join(CARPETA, archivo);
      const buffer = fs.readFileSync(origen);
      const predio = predios.get(codigo) || null;
      const incidencia = (predio?.incidencias || "").trim();
      const descripcion = [
        "Generada automáticamente desde Salesforce",
        establecimientos.get(codigo) ? `· ${establecimientos.get(codigo)}` : "",
        incidencia ? `· ${incidencia}` : "",
      ].filter(Boolean).join(" ");

      const safeName = nombreSeguro();
      const datos = {
        nombre: codigo,
        descripcion,
        archivoNombre: archivo,
        archivoTipo: DOCX_MIME,
        archivoRuta: `/uploads/actas/${safeName}`,
        archivoSize: buffer.length,
        predioId: predio?.id || null,
        subidoPorId: autor.id,
      };

      if (!APLICAR) {
        console.log(`  ${previa ? "pisaria " : "crearia "} ${codigo}  ${predio ? "" : "(sin predio en Carrot) "}${descripcion.slice(0, 70)}`);
        previa ? (pisadas += 1) : (creadas += 1);
        continue;
      }

      fs.writeFileSync(path.join(uploadsDir, safeName), buffer);

      if (previa) {
        // El archivo viejo se borra solo si de verdad cae dentro de uploads.
        try {
          const viejo = path.resolve(path.join(process.cwd(), previa.archivoRuta));
          if (viejo.startsWith(path.join(process.cwd(), "uploads"))) fs.unlinkSync(viejo);
        } catch { /* si no esta, no importa */ }
        const acta = await prisma.acta.update({
          where: { id: previa.id },
          data: { ...datos, version: { increment: 1 } },
        });
        await prisma.actividad.create({
          data: { accion: "EDITAR", descripcion: `Acta "${codigo}" regenerada desde Salesforce`,
                  entidad: "ACTA", entidadId: acta.id, userId: autor.id },
        }).catch(() => {});
        pisadas += 1;
      } else {
        const acta = await prisma.acta.create({ data: datos });
        await prisma.actividad.create({
          data: { accion: "CREAR", descripcion: `Acta "${codigo}" generada desde Salesforce`,
                  entidad: "ACTA", entidadId: acta.id, userId: autor.id },
        }).catch(() => {});
        creadas += 1;
      }

      if ((creadas + pisadas) % 100 === 0) console.log(`  ... ${creadas + pisadas} registradas`);
    } catch (e) {
      fallidas += 1;
      console.log(`  ERROR ${codigo}: ${String(e).slice(0, 120)}`);
    }
  }

  console.log(`\ncreadas: ${creadas} · pisadas: ${pisadas} · salteadas: ${salteadas} · con error: ${fallidas}`);
  if (!APLICAR) console.log("(prueba: no se escribio nada. Volve a correr con --aplicar)");
  else console.log(`total de actas en Carrot ahora: ${await prisma.acta.count()}`);
})().catch((e) => { console.log("ERROR", String(e).slice(0, 500)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

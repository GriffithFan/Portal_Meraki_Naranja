/**
 * Migración idempotente de la sección Personal:
 *  1) Siembra el catálogo de proyectos (Pisos tecnológicos, Bapro, Tableros, Oficina).
 *  2) Convierte cada ficha SIN `secciones` a la estructura dinámica, a partir de
 *     los campos legacy (columnas fijas + camposExtra + notasSecciones).
 *
 * Reusa las claves legacy como id de campo (dni, seguro, …) para que los adjuntos
 * existentes (FichaArchivo.seccion) sigan apuntando al campo correcto.
 *
 * Correr en el VPS tras `db push`:  node scripts/migrate-personal-secciones.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PROYECTOS = ["Pisos tecnológicos", "Bapro", "Tableros", "Oficina"];

function nuevoId(prefijo = "c") {
  return `${prefijo}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
function campo(id, label, tipo = "text", valor = "", nota = "") {
  return { id, label, valor: valor == null ? "" : String(valor), tipo, nota: nota || "" };
}

function legacyASecciones(f) {
  const notas = (f.notasSecciones && typeof f.notasSecciones === "object" && !Array.isArray(f.notasSecciones)) ? f.notasSecciones : {};
  const n = (k) => notas[k] || "";
  const secciones = [
    { id: "datos-personales", titulo: "Datos personales", campos: [
      campo("dni", "DNI", "text", f.dni, n("dni")),
      campo("direccion", "Dirección", "text", f.direccion, n("direccion")),
      campo("telefono", "Teléfono", "text", f.telefono, n("telefono")),
    ]},
    { id: "documentacion", titulo: "Documentación", campos: [
      campo("carnet", "Carnet", "text", f.carnet, n("carnet")),
      campo("seguro", "Seguro", "text", f.seguro, n("seguro")),
      campo("monotributo", "Monotributo", "text", f.monotributo, n("monotributo")),
    ]},
    { id: "vehiculo", titulo: "Vehículo", campos: [
      campo("autoModelo", "Modelo", "text", f.autoModelo),
      campo("autoPatente", "Patente", "text", f.autoPatente),
      campo("autoKmts", "Kilómetros", "number", f.autoKmts == null ? "" : f.autoKmts),
      campo("autoTarjetaRed", "Tarjeta en red", "text", f.autoTarjetaRed, n("auto")),
    ]},
  ];
  const extra = (f.camposExtra && typeof f.camposExtra === "object" && !Array.isArray(f.camposExtra)) ? f.camposExtra : null;
  if (extra) {
    const campos = Object.entries(extra).filter(([k]) => k).map(([k, v]) => campo(nuevoId(), String(k), "text", v));
    if (campos.length) secciones.push({ id: "datos-adicionales", titulo: "Datos adicionales", campos });
  }
  return secciones;
}

(async () => {
  // 1) Sembrar proyectos
  let sembrados = 0;
  for (let i = 0; i < PROYECTOS.length; i++) {
    const nombre = PROYECTOS[i];
    const r = await prisma.proyecto.upsert({
      where: { nombre },
      update: {},
      create: { nombre, orden: i + 1 },
      select: { id: true },
    });
    if (r) sembrados++;
  }
  console.log(`Proyectos en catálogo asegurados: ${sembrados}/${PROYECTOS.length}`);

  // 2) Migrar fichas sin secciones
  const fichas = await prisma.fichaPersonal.findMany();
  let migradas = 0;
  for (const f of fichas) {
    const yaTiene = Array.isArray(f.secciones) && f.secciones.length > 0;
    if (yaTiene) continue;
    const secciones = legacyASecciones(f);
    await prisma.fichaPersonal.update({ where: { id: f.id }, data: { secciones } });
    migradas++;
  }
  console.log(`Fichas migradas a estructura dinámica: ${migradas} (total ${fichas.length})`);
  process.exit(0);
})().catch((e) => { console.error("Migración falló:", e.message); process.exit(1); });

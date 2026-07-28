/**
 * Agrega las secciones RENT CAR / SERVIS / ADICIONALES a las fichas de Personal
 * que NO las tengan (por id o por título), sin duplicar ni pisar datos.
 * Idempotente: correr las veces que haga falta.
 *
 *   node scripts/backfill-personal-secciones.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function campo(id, label, tipo = "text") { return { id, label, valor: "", tipo, nota: "" }; }

const SECCIONES_DEFAULT = [
  { id: "rent-car", titulo: "RENT CAR", campos: [
    campo("rc_empresa", "EMPRESA"),
    campo("rc_facturacion", "FACTURACION"),
    campo("rc_vencimiento", "VENCIMIENTO", "date"),
    campo("rc_prox_vencimiento", "PROX - VENCIMIENTO", "date"),
  ]},
  { id: "servis", titulo: "SERVIS", campos: [
    campo("sv_cada", "CADA"),
    campo("sv_km_actual", "KM ACTUAL", "number"),
    campo("sv_realizado", "REALIZADO"),
    campo("sv_fecha", "FECHA", "date"),
  ]},
  { id: "adicionales", titulo: "ADICIONALES", campos: [
    campo("ad_multas", "MULTAS"),
    campo("ad_peaje", "PEAJE"),
    campo("ad_facturas", "FACTURAS"),
    campo("ad_extras", "EXTRAS"),
  ]},
];

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

(async () => {
  const fichas = await prisma.fichaPersonal.findMany({ select: { id: true, nombre: true, secciones: true } });
  let tocadas = 0, agregadas = 0;
  for (const f of fichas) {
    const secs = Array.isArray(f.secciones) ? f.secciones : [];
    const idsExistentes = new Set(secs.map((s) => s.id));
    const titulosExistentes = new Set(secs.map((s) => norm(s.titulo)));
    const faltantes = SECCIONES_DEFAULT.filter((d) => !idsExistentes.has(d.id) && !titulosExistentes.has(norm(d.titulo)));
    if (faltantes.length === 0) continue;
    await prisma.fichaPersonal.update({ where: { id: f.id }, data: { secciones: [...secs, ...faltantes] } });
    tocadas++; agregadas += faltantes.length;
    console.log(`  ${f.nombre}: +${faltantes.map((s) => s.titulo).join(", ")}`);
  }
  console.log(`\nFichas actualizadas: ${tocadas}/${fichas.length} · secciones agregadas: ${agregadas}`);
  process.exit(0);
})().catch((e) => { console.error("Backfill falló:", e.message); process.exit(1); });

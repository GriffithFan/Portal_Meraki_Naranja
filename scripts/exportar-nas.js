/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Exporta toda la información de Carrot al NAS, ordenada en carpetas.
 *
 *   node scripts/exportar-nas.js              → solo lo nuevo desde la última corrida
 *   node scripts/exportar-nas.js --completo   → todo de nuevo, ignorando el historial
 *   node scripts/exportar-nas.js --salida /ruta/archivo.zip
 *
 * ── Por qué esto no es un `cp -r uploads/` ─────────────────────────────────────
 * En disco los archivos se guardan con nombres opacos: `1783451529850-pmqp0x.jpg`.
 * De 27.266 archivos, solo las actas y los reportes tienen un nombre que diga algo.
 * Copiar la carpeta tal cual serían 20.308 fotos sin contexto. Lo que sabe a qué predio
 * pertenece cada archivo es la BASE, así que la exportación se arma leyéndola: cada
 * archivo se copia al ZIP con el nombre y la carpeta que le corresponden.
 *
 * ── Incremental ────────────────────────────────────────────────────────────────
 * Se guarda un manifiesto con lo ya exportado. En la corrida siguiente solo entra lo que
 * no está, así se puede subir al NAS semana a semana sin repetir nada. Los archivos de
 * `uploads` no se modifican nunca (cada subida crea uno nuevo), por eso alcanza con
 * recordar la ruta de origen; no hace falta hash.
 *
 * El índice y el README se regeneran SIEMPRE: son la foto del estado actual.
 */

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const RAIZ = path.resolve(__dirname, "..");
const UPLOADS = path.join(RAIZ, "uploads");
const MANIFIESTO = path.join(UPLOADS, "nas-manifiesto.json");

const args = process.argv.slice(2);
const COMPLETO = args.includes("--completo");
const idxSalida = args.indexOf("--salida");
const SALIDA = idxSalida >= 0 && args[idxSalida + 1]
  ? args[idxSalida + 1]
  : path.join(UPLOADS, `nas-${new Date().toISOString().slice(0, 10)}${COMPLETO ? "-completo" : ""}.zip`);

/** Nombres válidos en Windows y en el NAS. Se conservan los acentos: UTF-8 no molesta. */
function limpio(nombre, max = 80) {
  return String(nombre || "")
    .replace(/[\\/:*?"<>|]/g, "-")   // prohibidos en Windows
    .replace(/[\x00-\x1f]/g, "")     // control
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, "");          // Windows no admite terminar en punto o espacio
}

const p2 = (n) => String(n).padStart(2, "0");
const fecha = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const anioMes = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;

const prisma = new PrismaClient();

async function main() {
  const t0 = Date.now();
  const previo = !COMPLETO && fs.existsSync(MANIFIESTO)
    ? JSON.parse(fs.readFileSync(MANIFIESTO, "utf8"))
    : { corridas: [], exportados: [] };
  const yaExportado = new Set(previo.exportados || []);
  console.log(`manifiesto: ${yaExportado.size} archivos ya subidos en corridas anteriores`);

  /** Cada entrada: { origen: ruta absoluta en disco, destino: ruta dentro del ZIP }. */
  const entradas = [];
  const nuevos = [];
  const agregar = (origen, destino) => {
    if (!origen || !fs.existsSync(origen)) return;
    const clave = path.relative(UPLOADS, origen);
    if (yaExportado.has(clave)) return;
    entradas.push({ origen, destino });
    nuevos.push(clave);
  };
  const rutaDe = (relativa) => {
    if (!relativa) return null;
    const limpia = String(relativa).replace(/^\/?uploads\//, "");
    return path.join(UPLOADS, limpia);
  };

  // ── Predios: la carpeta de cada escuela ─────────────────────────────────────
  const predios = await prisma.predio.findMany({
    select: {
      id: true, codigo: true, nombre: true, provincia: true, cue: true,
      direccion: true, ciudad: true, latitud: true, longitud: true,
      fechaActualizacion: true,
      estado: { select: { nombre: true } },
      espacio: { select: { nombre: true } },
      asignaciones: {
        where: { tipo: { in: ["TAREA", "TECNICO"] } },
        select: { usuario: { select: { nombre: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  console.log(`predios: ${predios.length}`);

  const { provinciaCanonica } = cargarProvincias();
  const carpetaDe = new Map();     // predioId  -> ruta dentro del ZIP
  const porCodigo = new Map();     // codigo    -> predio
  for (const pr of predios) {
    const prov = limpio(provinciaCanonica(pr.provincia) || "Unknown province", 40);
    const carpeta = `01 Sites/${prov}/${limpio(`${pr.codigo || "sin-codigo"} - ${pr.nombre || ""}`, 90)}`;
    carpetaDe.set(pr.id, carpeta);
    if (pr.codigo) porCodigo.set(String(pr.codigo), pr);
  }

  // Actas: el vínculo formal casi no existe (17 de 2.329 tienen predioId), pero el
  // nombre del archivo trae el código —`Acta_822963.docx`— y por ahí sí se resuelven.
  const actas = await prisma.acta.findMany({
    select: { nombre: true, archivoNombre: true, archivoRuta: true, predioId: true, createdAt: true, version: true },
  });
  let actasUbicadas = 0, actasSueltas = 0;
  for (const a of actas) {
    const origen = rutaDe(a.archivoRuta);
    let carpeta = a.predioId ? carpetaDe.get(a.predioId) : null;
    if (!carpeta) {
      const m = String(a.nombre || "").match(/[0-9]{6}/) || String(a.archivoNombre || "").match(/[0-9]{6}/);
      const pr = m ? porCodigo.get(m[0]) : null;
      if (pr) carpeta = carpetaDe.get(pr.id);
    }
    if (carpeta) actasUbicadas++; else { carpeta = "01 Sites/_Unmatched certificates"; actasSueltas++; }
    const sufijo = a.version > 1 ? ` (v${a.version})` : "";
    agregar(origen, `${carpeta}/Certificates/${limpio(path.parse(a.archivoNombre || "acta").name + sufijo)}${path.extname(a.archivoNombre || ".docx")}`);
  }
  console.log(`actas: ${actasUbicadas} ubicadas en su predio, ${actasSueltas} sin predio`);

  // Fotos y adjuntos de comentarios: estos sí traen el predio.
  const comentarios = await prisma.comentarioArchivo.findMany({
    select: {
      archivoUrl: true, archivoNombre: true, createdAt: true,
      comentario: { select: { predioId: true } },
    },
  });
  let fotos = 0;
  for (const c of comentarios) {
    const carpeta = c.comentario?.predioId ? carpetaDe.get(c.comentario.predioId) : null;
    if (!carpeta) continue;
    const ext = path.extname(c.archivoNombre || "") || path.extname(c.archivoUrl || "") || ".jpg";
    agregar(rutaDe(c.archivoUrl), `${carpeta}/Photos/${fecha(c.createdAt)} ${limpio(path.parse(c.archivoNombre || "foto").name, 50)}${ext}`);
    fotos++;
  }
  console.log(`fotos de comentarios: ${fotos}`);

  // ── Reportes ────────────────────────────────────────────────────────────────
  for (const [dir, destino] of [["reportes", "02 Reports/Billing"], ["kpi", "02 Reports/Weekly indicator"]]) {
    const abs = path.join(UPLOADS, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      const origen = path.join(abs, f);
      if (fs.statSync(origen).isFile()) agregar(origen, `${destino}/${limpio(f, 120)}`);
    }
  }

  // ── Documentación técnica (los instructivos) ────────────────────────────────
  const instr = path.join(UPLOADS, "instructivos");
  if (fs.existsSync(instr)) {
    for (const f of fs.readdirSync(instr)) {
      const origen = path.join(instr, f);
      if (fs.statSync(origen).isFile()) agregar(origen, `03 Documentation/${limpio(f, 120)}`);
    }
  }

  // ── Legajos ─────────────────────────────────────────────────────────────────
  // Van aparte y con el nombre de la persona, para que la carpeta se pueda restringir.
  const fichas = await prisma.fichaPersonal.findMany({ select: { id: true, nombre: true, fotoUrl: true } });
  const nombreFicha = new Map(fichas.map((f) => [f.id, limpio(f.nombre || f.id, 60)]));
  const docs = await prisma.fichaArchivo.findMany({
    select: { fichaId: true, ruta: true, nombre: true, seccion: true, createdAt: true },
  });
  let legajos = 0;
  for (const d of docs) {
    const quien = nombreFicha.get(d.fichaId) || "Sin identificar";
    // La sección (dni, carnet, seguro, monotributo…) es lo que hace navegable el legajo.
    const seccion = limpio(d.seccion || "general", 30);
    agregar(rutaDe(d.ruta), `04 Personnel/${quien}/${seccion}/${limpio(d.nombre || path.basename(d.ruta), 100)}`);
    legajos++;
  }
  for (const f of fichas) {
    if (!f.fotoUrl) continue;
    const ext = path.extname(f.fotoUrl) || ".jpg";
    agregar(rutaDe(f.fotoUrl), `04 Personnel/${nombreFicha.get(f.id)}/Foto${ext}`);
    legajos++;
  }
  console.log(`legajos: ${legajos} archivos de ${fichas.length} personas`);

  // ── Mesa de ayuda ───────────────────────────────────────────────────────────
  // El chat no guarda a qué predio pertenece cada conversación, así que se ordena por
  // mes y por técnico. Forzarlo a una escuela sería inventar un vínculo que no existe.
  const mensajes = await prisma.chatMensaje.findMany({
    where: { archivoUrl: { not: null } },
    select: {
      id: true, archivoUrl: true, archivoNombre: true, createdAt: true,
      conversacion: { select: { asunto: true, creador: { select: { nombre: true } } } },
    },
  });
  let adjuntos = 0;
  for (const m of mensajes) {
    const quien = limpio(m.conversacion?.creador?.nombre || "Sin técnico", 40);
    const ext = path.extname(m.archivoNombre || "") || path.extname(m.archivoUrl || "");
    const base = limpio(path.parse(m.archivoNombre || "adjunto").name, 50);
    agregar(rutaDe(m.archivoUrl), `05 Helpdesk/${anioMes(m.createdAt)}/${quien}/${fecha(m.createdAt)} ${base}${ext}`);
    adjuntos++;
  }
  console.log(`adjuntos de chat: ${adjuntos}`);

  // Evidencias ODK: se dejan donde cuelgan (el mensaje de chat), que es el modo simple.
  // Se les pone fecha y técnico adelante para que la carpeta diga algo.
  const evidencias = path.join(UPLOADS, "evidencias-cache");
  let carpetasEv = 0, archivosEv = 0;
  if (fs.existsSync(evidencias)) {
    const porMensaje = new Map(mensajes.map((m) => [m.id, m]));
    for (const dir of fs.readdirSync(evidencias)) {
      const abs = path.join(evidencias, dir);
      if (!fs.statSync(abs).isDirectory()) continue;
      const m = porMensaje.get(dir);
      const etiqueta = m
        ? `${fecha(m.createdAt)} ${limpio(m.conversacion?.creador?.nombre || "Sin técnico", 40)}`
        : `Sin fecha ${dir.slice(0, 8)}`;
      carpetasEv++;
      for (const rel of listarRecursivo(abs)) {
        agregar(path.join(abs, rel), `05 Helpdesk/Evidence/${limpio(etiqueta, 60)}/${rel.split(path.sep).map((x) => limpio(x, 60)).join("/")}`);
        archivosEv++;
      }
    }
  }
  console.log(`evidencias: ${carpetasEv} carpetas, ${archivosEv} archivos`);

  // ── Índice: sin esto, 2.451 carpetas no se pueden buscar ────────────────────
  const equipos = await prisma.equipo.findMany({
    select: {
      inventario: true, nombre: true, numeroSerie: true, modelo: true, marca: true,
      categoria: true, estado: true, ubicacion: true, cantidad: true, updatedAt: true,
    },
    orderBy: { inventario: "asc" },
  }).catch(() => []);
  const indice = await construirIndice(predios, equipos, carpetaDe, provinciaCanonica);

  // ── Armar el ZIP ────────────────────────────────────────────────────────────
  if (!entradas.length) {
    console.log("\nNo hay archivos nuevos desde la última corrida. No se genera ZIP.");
    await prisma.$disconnect();
    return;
  }
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  const salida = fs.createWriteStream(SALIDA);
  // Nivel 1: casi todo son JPG y DOCX, que ya vienen comprimidos. Subir el nivel
  // costaría minutos de CPU para ganar unos pocos MB.
  const zip = archiver("zip", { zlib: { level: 1 } });
  const listo = new Promise((res, rej) => { salida.on("close", res); zip.on("error", rej); });
  zip.pipe(salida);

  zip.append(indice.readme, { name: "00 Index/README.txt" });
  zip.append(indice.excel, { name: "00 Index/Sites and equipment.xlsx" });
  for (const e of entradas) zip.file(e.origen, { name: e.destino });

  let ultimo = 0;
  zip.on("progress", (d) => {
    const n = d.entries.processed;
    if (n - ultimo >= 2000) { ultimo = n; console.log(`  ${n}/${entradas.length} archivos…`); }
  });
  await zip.finalize();
  await listo;

  const mb = (fs.statSync(SALIDA).size / 1024 / 1024).toFixed(0);
  fs.writeFileSync(MANIFIESTO, JSON.stringify({
    corridas: [...(previo.corridas || []), { fecha: new Date().toISOString(), archivos: nuevos.length, zip: path.basename(SALIDA), completo: COMPLETO }],
    exportados: [...yaExportado, ...nuevos],
  }, null, 0));

  console.log(`\nZIP: ${SALIDA}`);
  console.log(`     ${entradas.length} archivos · ${mb} MB · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`manifiesto actualizado: ${yaExportado.size + nuevos.length} archivos exportados en total`);
  await prisma.$disconnect();
}

/** Lista rutas relativas de todos los archivos bajo `dir`. */
function listarRecursivo(dir, base = "") {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entrada.name);
    if (entrada.isDirectory()) salida.push(...listarRecursivo(path.join(dir, entrada.name), rel));
    else salida.push(rel);
  }
  return salida;
}

/** provinciaCanonica vive en TypeScript; acá se replica lo mínimo. */
function cargarProvincias() {
  const CANONICO = {
    "buenos aires": "Buenos Aires", "santa fe": "Santa Fe", "entre rios": "Entre Ríos",
    "cordoba": "Córdoba", "rio negro": "Río Negro", "neuquen": "Neuquén", "tucuman": "Tucumán",
    "santiago del estero": "Sgo. del Estero", "sgo del estero": "Sgo. del Estero",
    "tierra del fuego": "Tierra del Fuego",
  };
  return {
    provinciaCanonica(valor) {
      const limpioV = String(valor || "").trim();
      if (!limpioV) return null;
      const clave = limpioV.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\./g, "").replace(/\s+/g, " ").trim();
      return CANONICO[clave] || clave.replace(/(^| )(\w)/g, (_m, s, c) => s + c.toUpperCase());
    },
  };
}

async function construirIndice(predios, equipos, carpetaDe, provinciaCanonica) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "THNET — Carrot";
  wb.created = new Date();

  const cab = (ws, cols) => {
    ws.columns = cols;
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } }));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };

  const ws = wb.addWorksheet("Sites");
  cab(ws, [
    { header: "Code", key: "codigo", width: 12 },
    { header: "Name", key: "nombre", width: 46 },
    { header: "Province", key: "provincia", width: 16 },
    { header: "City", key: "ciudad", width: 20 },
    { header: "CUE", key: "cue", width: 14 },
    { header: "Address", key: "direccion", width: 42 },
    { header: "Status", key: "estado", width: 18 },
    { header: "Workspace", key: "espacio", width: 20 },
    { header: "Technician", key: "tecnico", width: 20 },
    { header: "Latitude", key: "lat", width: 12 },
    { header: "Longitude", key: "lon", width: 12 },
    { header: "Last update", key: "act", width: 14 },
    { header: "Folder", key: "carpeta", width: 60 },
  ]);
  for (const pr of predios) {
    const asig = pr.asignaciones || [];
    ws.addRow({
      codigo: pr.codigo, nombre: pr.nombre,
      provincia: provinciaCanonica(pr.provincia) || "", ciudad: pr.ciudad || "",
      cue: pr.cue || "", direccion: pr.direccion || "",
      estado: pr.estado?.nombre || "", espacio: pr.espacio?.nombre || "",
      tecnico: asig.length ? asig[asig.length - 1].usuario?.nombre || "" : "",
      lat: pr.latitud ?? "", lon: pr.longitud ?? "",
      act: pr.fechaActualizacion ? pr.fechaActualizacion.toISOString().slice(0, 10) : "",
      carpeta: carpetaDe.get(pr.id) || "",
    });
  }

  if (equipos.length) {
    const we = wb.addWorksheet("Equipment");
    cab(we, [
      { header: "Inventory", key: "inv", width: 11 },
      { header: "Name", key: "nombre", width: 30 },
      { header: "Serial", key: "serie", width: 24 },
      { header: "Brand", key: "marca", width: 16 },
      { header: "Model", key: "modelo", width: 22 },
      { header: "Category", key: "categoria", width: 18 },
      { header: "Status", key: "estado", width: 16 },
      { header: "Location", key: "ubicacion", width: 28 },
      { header: "Qty", key: "cantidad", width: 7 },
      { header: "Last update", key: "act", width: 14 },
    ]);
    for (const eq of equipos) {
      we.addRow({
        inv: eq.inventario, nombre: eq.nombre || "", serie: eq.numeroSerie || "",
        marca: eq.marca || "", modelo: eq.modelo || "", categoria: eq.categoria || "",
        estado: eq.estado || "", ubicacion: eq.ubicacion || "", cantidad: eq.cantidad ?? 1,
        act: eq.updatedAt ? eq.updatedAt.toISOString().slice(0, 10) : "",
      });
    }
  }

  const readme = [
    "PISOS TECNOLÓGICOS — información exportada desde Carrot",
    `Generado: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "",
    "CÓMO ESTÁ ORDENADO",
    "",
    "  00 Index/           Este índice. Buscá acá primero: la columna 'Folder' dice",
    "                      en qué carpeta está cada predio.",
    "  01 Sites/           Una carpeta por predio, agrupadas por provincia.",
    "                        Certificates/  actas",
    "                        Photos/        fotos y adjuntos cargados en el predio",
    "  02 Reports/         Facturación semanal e indicador semanal.",
    "  03 Documentation/   Instructivos y documentación técnica.",
    "  04 Personnel/       Legajos. Acceso restringido.",
    "  05 Helpdesk/        Chat de mesa de ayuda por mes y técnico, y las",
    "                      evidencias ODK que se enviaron por ahí.",
    "",
    "SOBRE LAS ACTUALIZACIONES",
    "",
    "  Cada exportación trae SOLO lo que no se subió antes. Se descomprime encima de",
    "  la carpeta existente y se suma a lo que ya está, sin duplicar ni pisar nada.",
    "  El índice sí se reemplaza en cada corrida: es la foto del estado actual.",
    "",
    "POR QUÉ EL CHAT NO ESTÁ POR PREDIO",
    "",
    "  Las conversaciones de mesa de ayuda no registran a qué predio pertenecen, así",
    "  que se ordenan por mes y por técnico. Ponerlas dentro de una escuela sería",
    "  inventar un vínculo que no existe en los datos.",
    "",
  ].join("\n");

  return { excel: Buffer.from(await wb.xlsx.writeBuffer()), readme };
}

main().catch((e) => { console.error(e); process.exit(1); });

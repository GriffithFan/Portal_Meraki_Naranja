import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { inicioSemana, SEMANA_MS } from "@/lib/semanaRanking";
import { prediosFacturadosHasta, yaFueFacturado } from "@/lib/prediosFacturados";
import { elegirTecnicoAcreditado, resolveEquipoKey, normalizeAssigneeName } from "@/utils/equipoUtils";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

const OBJETIVO_SEMANAL = 7; // meta de conformidades por semana (roadmap)
const SEMANAS = 10;
const MESES = 6;

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "");
}

function getStateBucket(estado?: { nombre?: string | null; clave?: string | null } | null): "conformes" | "noConformes" | "instaladosAuditar" | null {
  const nombre = normalizeText(estado?.nombre);
  const clave = normalizeText(estado?.clave);
  if (nombre === "conforme" || clave === "conforme") return "conformes";
  if (nombre === "noconforme" || clave === "noconforme" || nombre === "nc" || clave === "nc") return "noConformes";
  if (nombre.includes("instalad") || clave.includes("instalad") || nombre.includes("auditar") || clave.includes("auditar")) return "instaladosAuditar";
  return null;
}

// Motivo del NC: incidencia → nota → último comentario (misma lógica que KPIs).
function getNoConformeReason(predio: { incidencias?: string | null; notas?: string | null; comentarios?: Array<{ contenido?: string | null }> }) {
  const inc = predio.incidencias?.trim();
  const nota = predio.notas?.trim();
  const com = predio.comentarios?.[0]?.contenido?.trim();
  return (nota || com || inc || "");
}

function classifyNoConforme(text: string) {
  const n = normalizeText(text);
  if (!n) return "Sin detalle";
  if (["evidencia", "foto", "adjunto", "imagen", "captura", "visualiza", "visible", "pdu"].some((t) => n.includes(t))) return "Evidencias faltantes o con error";
  if (["gps", "coordenada", "ubicacion", "latitud", "longitud", "mapa"].some((t) => n.includes(t))) return "GPS / ubicación";
  if (["etiqueta", "rotulo", "rotulado", "lac", "cue"].some((t) => n.includes(t))) return "Rotulado / datos técnicos";
  if (["instalacion", "instalado", "conexion", "conectado", "cable", "puerto", "switch", "offline", "mesh", "giga"].some((t) => n.includes(t))) return "Fallas técnicas de instalación";
  if (["acta", "formulario", "dato", "incompleto", "documentacion", "serial", "firma"].some((t) => n.includes(t))) return "Actas / documentación";
  if (["acceso", "ausente", "cerrado", "visita", "reprogramar", "ingresar"].some((t) => n.includes(t))) return "Acceso / visita";
  return "Otros motivos";
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const now = new Date();
  const estados = await prisma.estadoConfig.findMany({ where: { activo: true }, select: { id: true, nombre: true, clave: true } });
  const bucketEstados = estados.filter((e) => getStateBucket(e));
  const estadoIds = bucketEstados.map((e) => e.id);

  // Predios asignados al usuario logueado, en estados conforme / no conforme / instalado-auditar.
  const predios = estadoIds.length > 0
    ? await prisma.predio.findMany({
        where: {
          estadoId: { in: estadoIds },
          asignaciones: { some: { userId: session.userId } },
        },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          incidencias: true,
          notas: true,
          fechaActualizacion: true,
          updatedAt: true,
          estado: { select: { nombre: true, clave: true } },
          comentarios: { orderBy: { createdAt: "desc" }, take: 1, select: { contenido: true } },
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { createdAt: true, usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
        take: 4000,
      })
    : [];

  // Esta pantalla tiene que dar EXACTAMENTE lo mismo que el ranking y la facturación.
  // Cuando no coincide, el técnico ve un número que después no cobra y reclama la
  // diferencia — paso el 28/08/2026: Sebastian veia 10 conformes y cobraba 9.
  const facturados = await prediosFacturadosHasta();

  // La clave con la que el ranking agrupa a este usuario.
  const yo = await prisma.user.findUnique({ where: { id: session.userId }, select: { nombre: true } });
  const miMergeKey = resolveEquipoKey(yo?.nombre || "") || normalizeAssigneeName(yo?.nombre || "") || session.userId;

  // Ventanas de tiempo.
  const startSemana = inicioSemana(now);
  const startSerie = new Date(inicioSemana(now).getTime() - (SEMANAS - 1) * SEMANA_MS);
  const semanasLabels = Array.from({ length: SEMANAS }, (_, i) => {
    const d = new Date(startSerie.getTime() + i * SEMANA_MS);
    return { label: d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }), desde: d.toISOString() };
  });
  const conformesSemana = new Array(SEMANAS).fill(0);
  const totalSemana = new Array(SEMANAS).fill(0);

  const mesesLabels = Array.from({ length: MESES }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MESES - 1) + i, 1);
    return { label: d.toLocaleDateString("es-AR", { month: "short" }), key: `${d.getFullYear()}-${d.getMonth()}` };
  });
  const conformesMes = new Array(MESES).fill(0);
  const mesIndexByKey = new Map(mesesLabels.map((m, i) => [m.key, i]));

  const totales = { conformes: 0, noConformes: 0, instaladosAuditar: 0 };
  const semana = { conformes: 0, noConformes: 0, instaladosAuditar: 0 };
  const ncMotivos: string[] = [];
  const ncEjemplos: Array<{ predio: string; motivo: string; categoria: string }> = [];

  /** Conformes que ya se cobraron antes y volvieron a CONFORME: se muestran aparte. */
  let reconformadosYaFacturados = 0;

  for (const p of predios) {
    const bucket = getStateBucket(p.estado);
    if (!bucket) continue;
    const fecha = p.fechaActualizacion || p.updatedAt;

    // Misma regla que el ranking: un predio que ya entro en un reporte de facturacion
    // de una semana ANTERIOR no vuelve a sumar. Pasa cuando alguien lo mueve a
    // INSTALADO por error y lo devuelve a CONFORME: se genera una conformidad nueva
    // por trabajo que ya se cobro.
    if (bucket === "conformes" && yaFueFacturado(facturados, p.id, fecha)) {
      if (fecha && fecha >= startSemana) reconformadosYaFacturados += 1;
      continue;
    }

    // Y misma atribucion que el ranking: el predio se le acredita a UN solo tecnico,
    // el ultimo asignado. Si no, cuando trabajan dos en el mismo predio los dos lo ven
    // en su progreso y solo uno lo cobra.
    //
    // La comparacion es por mergeKey y no por id de usuario, que es como agrupa el
    // ranking: los tecnicos que comparten equipo cuentan juntos, y comparar por id
    // dejaria afuera predios que el ranking si le acredita.
    const elegido = elegirTecnicoAcreditado(p.asignaciones);
    if (!elegido || elegido.mergeKey !== miMergeKey) continue;

    totales[bucket] += 1;

    // Esta semana.
    if (fecha && fecha >= startSemana) semana[bucket] += 1;

    // Evolución semanal.
    if (fecha) {
      const wi = Math.floor((inicioSemana(fecha).getTime() - startSerie.getTime()) / SEMANA_MS);
      if (wi >= 0 && wi < SEMANAS) {
        totalSemana[wi] += 1;
        if (bucket === "conformes") conformesSemana[wi] += 1;
      }
      // Evolución mensual (solo conformes).
      if (bucket === "conformes") {
        const mi = mesIndexByKey.get(`${fecha.getFullYear()}-${fecha.getMonth()}`);
        if (mi != null) conformesMes[mi] += 1;
      }
    }

    // Motivos de NC.
    if (bucket === "noConformes") {
      const motivo = getNoConformeReason(p);
      const categoria = classifyNoConforme(motivo);
      ncMotivos.push(categoria);
      if (ncEjemplos.length < 8 && motivo) {
        ncEjemplos.push({ predio: p.codigo || p.nombre || "?", motivo: motivo.slice(0, 200), categoria });
      }
    }
  }

  // Categorías de NC ordenadas por frecuencia.
  const catCount = new Map<string, number>();
  for (const c of ncMotivos) catCount.set(c, (catCount.get(c) || 0) + 1);
  const categoriasNC = Array.from(catCount.entries()).map(([categoria, count]) => ({ categoria, count })).sort((a, b) => b.count - a.count);

  // Promedios.
  const semanasConDatos = totalSemana.filter((n) => n > 0).length || 1;
  const sumaConformes = conformesSemana.reduce((a, b) => a + b, 0);
  const promedioConformes = Math.round((sumaConformes / semanasConDatos) * 10) / 10;
  const mejorSemana = Math.max(0, ...conformesSemana);

  const denom = totales.conformes + totales.noConformes;
  const porcentajeConformidad = denom > 0 ? Math.round((totales.conformes / denom) * 100) : null;

  return NextResponse.json({
    objetivoSemanal: OBJETIVO_SEMANAL,
    semana,
    totales,
    porcentajeConformidad,
    /** Predios que volvieron a CONFORME pero ya se cobraron antes: no suman, se avisan. */
    reconformadosYaFacturados,
    evolucionSemanal: semanasLabels.map((s, i) => ({ ...s, conformes: conformesSemana[i], total: totalSemana[i] })),
    evolucionMensual: mesesLabels.map((m, i) => ({ label: m.label, conformes: conformesMes[i] })),
    promedios: { conformesPorSemana: promedioConformes, mejorSemana },
    motivosNC: { total: ncMotivos.length, categorias: categoriasNC, ejemplos: ncEjemplos },
  }, { headers: { "Cache-Control": "no-store" } });
}

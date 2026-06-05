import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getEquipoDisplayName, normalizeAssigneeName, resolveEquipoKey } from "@/utils/equipoUtils";

const KPI_CACHE_TTL_MS = 45_000;

const cachedKpis: Record<string, { exp: number; data: unknown } | undefined> = {};

function getWeekRange(now = new Date()) {
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const desde = new Date(now);
  desde.setDate(now.getDate() - diffToMonday);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(now);
  hasta.setHours(23, 59, 59, 999);
  return { desde, hasta };
}

function getISOWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeText(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStateLabel(value?: string | null) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function getStateBucket(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = normalizeStateLabel(estado?.nombre);
  const clave = normalizeStateLabel(estado?.clave);
  const label = `${clave} ${nombre}`.trim();

  if (!label) return "otro" as const;
  if (label.includes("no conforme") || label.includes("noconforme") || label === "nc") return "noConforme" as const;
  if (["conforme", "cerrad", "finaliz", "bloque", "blocke", "instalad"].some((token) => label.includes(token))) return "conforme" as const;
  return "otro" as const;
}

function getNoConformeReason(predio: {
  incidencias?: string | null;
  notas?: string | null;
  comentarios?: Array<{ contenido?: string | null }>;
}) {
  const incidencia = predio.incidencias?.trim();
  if (incidencia) return { motivo: incidencia, fuente: "incidencia" as const };

  const nota = predio.notas?.trim();
  if (nota) return { motivo: nota, fuente: "nota" as const };

  const comentario = predio.comentarios?.[0]?.contenido?.trim();
  if (comentario) return { motivo: comentario, fuente: "comentario" as const };

  return { motivo: "", fuente: null };
}

const STOP_WORDS = new Set([
  "que", "para", "con", "sin", "del", "las", "los", "por", "una", "uno", "unos", "unas", "esta", "este", "estos", "estas", "desde", "hasta", "sobre", "entre", "fue", "fueron", "hay", "muy", "mas", "pero", "porque", "donde", "cuando", "como", "solo", "nota", "notas", "predio", "tecnico", "mesa", "ayuda", "aun", "aunque", "sino", "debe", "deben", "quedo", "queda", "falta", "faltan", "tiene", "tener", "ninguna", "ninguno", "mismo", "misma", "mismos", "mismas", "todo", "toda", "todos", "todas",
]);

function extractKeywords(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return [] as string[];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function classifyNoConforme(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return "Sin detalle";

  if (["evidencia", "foto", "fotos", "adjunto", "adjuntar", "imagen", "imagenes", "captura", "visualiza", "visible"].some((token) => normalized.includes(token))) {
    return "Falta o error de evidencias";
  }
  if (["gps", "coordenada", "ubicacion", "latitud", "longitud", "mapa"].some((token) => normalized.includes(token))) {
    return "Problemas de GPS/ubicacion";
  }
  if (["etiqueta", "rotulo", "rotulado", "lac", "lacr", "cue"].some((token) => normalized.includes(token))) {
    return "Errores de rotulado o datos tecnicos";
  }
  if (["instalacion", "instalado", "conexion", "conectado", "cable", "puerto", "switch", "ap"].some((token) => normalized.includes(token))) {
    return "Fallas tecnicas de instalacion";
  }
  if (["acta", "formulario", "dato", "datos", "incompleto", "incompleta", "documentacion"].some((token) => normalized.includes(token))) {
    return "Documentacion incompleta";
  }
  if (["acceso", "ausente", "cerrado", "visita", "reprogramar"].some((token) => normalized.includes(token))) {
    return "Problemas de acceso/visita";
  }

  return "Otros motivos recurrentes";
}

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cacheKey = session.rol === "ADMIN" ? "admin" : "standard";
  const cached = cachedKpis[cacheKey];
  if (cached && cached.exp > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=30" },
    });
  }

  const now = new Date();
  const { desde: startOfWeek, hasta: endOfWeek } = getWeekRange(now);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86400000);

  const [
    prediosTotal,
    prediosConRed,
    prediosPorEstado,
    prediosConAsignaciones,
    prediosPorProvincia,
    prediosPorAmbito,
    tareasCompletadasSemana,
    tareasCompletadasMes,
    tareasPendientes,
    tareasHoy,
    equiposDisponibles,
    equiposAsignados,
    equiposRotos,
    usuariosActivos,
    actividadSemana,
    notificacionesSinLeerTotal,
    prediosConGPS,
  ] = await Promise.all([
    prisma.predio.count(),
    prisma.predio.count({ where: { merakiNetworkId: { not: null } } }),
    prisma.predio.groupBy({
      by: ["estadoId"],
      _count: true,
    }),
    prisma.predio.findMany({
      select: {
        asignaciones: {
          where: { tipo: { in: ["TAREA", "TECNICO"] } },
          include: { usuario: { select: { nombre: true } } },
        },
      },
    }),
    prisma.predio.groupBy({
      by: ["provincia"],
      _count: true,
    }),
    prisma.predio.groupBy({
      by: ["ambito"],
      _count: true,
    }),
    prisma.tareaCalendario.count({
      where: { completada: true, fecha: { gte: startOfWeek } },
    }),
    prisma.tareaCalendario.count({
      where: { completada: true, fecha: { gte: startOfMonth } },
    }),
    prisma.tareaCalendario.count({ where: { completada: false } }),
    prisma.tareaCalendario.count({
      where: {
        fecha: { gte: startOfToday, lt: endOfToday },
        completada: false,
      },
    }),
    prisma.equipo.count({ where: { estado: "DISPONIBLE" } }),
    prisma.equipo.count({ where: { estado: { in: ["ASIGNADO", "INSTALADO"] } } }),
    prisma.equipo.count({ where: { estado: { in: ["ROTO", "PERDIDO"] } } }),
    prisma.user.count({ where: { activo: true } }),
    prisma.actividad.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.notificacion.count({ where: { leida: false } }),
    prisma.predio.count({
      where: {
        latitud: { not: null },
        longitud: { not: null },
      },
    }),
  ]);

  // Resolver nombres de estados
  const estadoIds = prediosPorEstado
    .map((e) => e.estadoId)
    .filter((id): id is string => id !== null);
  const estados = await prisma.estadoConfig.findMany({
    where: { id: { in: estadoIds } },
    select: { id: true, nombre: true, color: true },
  });
  const estadoMap = new Map(estados.map((e) => [e.id, e]));

  const byEstado = prediosPorEstado.map((e) => {
    const est = e.estadoId ? estadoMap.get(e.estadoId) : null;
    return {
      nombre: est?.nombre || "Sin estado",
      color: est?.color || "#94a3b8",
      count: e._count,
    };
  }).sort((a, b) => b.count - a.count);

  const asignadosCount = new Map<string, { nombre: string; count: number }>();
  for (const predio of prediosConAsignaciones) {
    const uniqueAssigned = new Map<string, string>();
    for (const asignacion of predio.asignaciones) {
      const nombre = asignacion.usuario.nombre;
      if (!nombre) continue;
      const resolvedKey = resolveEquipoKey(nombre);
      const mergeKey = resolvedKey || normalizeAssigneeName(nombre);
      if (!mergeKey || uniqueAssigned.has(mergeKey)) continue;
      uniqueAssigned.set(mergeKey, getEquipoDisplayName(resolvedKey || nombre));
    }

    if (uniqueAssigned.size === 0) {
      const current = asignadosCount.get("SIN_ASIGNAR") || { nombre: "Sin asignar", count: 0 };
      current.count += 1;
      asignadosCount.set("SIN_ASIGNAR", current);
    } else {
      for (const [mergeKey, displayName] of Array.from(uniqueAssigned.entries())) {
        const current = asignadosCount.get(mergeKey) || { nombre: displayName, count: 0 };
        current.count += 1;
        asignadosCount.set(mergeKey, current);
      }
    }
  }
  const byAsignado = Array.from(asignadosCount.values())
    .sort((a, b) => b.count - a.count);

  const byProvincia = prediosPorProvincia
    .map((e) => ({ nombre: e.provincia || "Sin provincia", count: e._count }))
    .sort((a, b) => b.count - a.count);

  const byAmbito = prediosPorAmbito
    .map((e) => ({ nombre: e.ambito || "Sin definir", count: e._count }))
    .sort((a, b) => b.count - a.count);

  const estadosPredioActivos = await prisma.estadoConfig.findMany({
    where: { entidad: "PREDIO", activo: true },
    select: { id: true, nombre: true, clave: true },
  });
  const noConformeEstadoIds = estadosPredioActivos
    .filter((estado) => getStateBucket(estado) === "noConforme")
    .map((estado) => estado.id);

  const noConformesSemana = noConformeEstadoIds.length > 0
    ? await prisma.predio.findMany({
        where: {
          estadoId: { in: noConformeEstadoIds },
          fechaActualizacion: { gte: startOfWeek, lte: endOfWeek },
        },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          incidencias: true,
          notas: true,
          fechaActualizacion: true,
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            include: { usuario: { select: { id: true, nombre: true } } },
          },
          comentarios: {
            orderBy: { createdAt: "desc" },
            take: 2,
            select: { contenido: true, createdAt: true },
          },
        },
        orderBy: { fechaActualizacion: "desc" },
      })
    : [];

  const keywordCounts = new Map<string, number>();
  const similitudesMap = new Map<string, {
    categoria: string;
    count: number;
    tecnicoCounts: Map<string, { tecnicoId: string; tecnicoNombre: string; cantidad: number }>;
    ejemplos: Array<{ predio: string; motivo: string; tecnicoNombre: string }>;
  }>();
  const porTecnicoNoConforme = new Map<string, {
    tecnicoId: string;
    tecnicoNombre: string;
    totalNoConformes: number;
    conMotivo: number;
    sinMotivo: number;
    categorias: Map<string, number>;
    keywords: Map<string, number>;
  }>();

  for (const predio of noConformesSemana) {
    const motivoInfo = getNoConformeReason(predio);
    const motivo = motivoInfo.motivo || "";
    const hasMotivo = motivo.trim().length > 0;
    const categoria = classifyNoConforme(motivo);

    const keywords = extractKeywords(motivo);
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }

    const tecnicosUnicos = new Map<string, { tecnicoId: string; tecnicoNombre: string }>();
    for (const asignacion of predio.asignaciones) {
      const tecnico = asignacion.usuario;
      const resolvedKey = resolveEquipoKey(tecnico.nombre);
      const mergeKey = resolvedKey || normalizeAssigneeName(tecnico.nombre) || tecnico.id;
      if (!mergeKey || tecnicosUnicos.has(mergeKey)) continue;
      tecnicosUnicos.set(mergeKey, {
        tecnicoId: mergeKey,
        tecnicoNombre: getEquipoDisplayName(resolvedKey || tecnico.nombre),
      });
    }
    if (tecnicosUnicos.size === 0) {
      tecnicosUnicos.set("SIN_ASIGNAR", { tecnicoId: "SIN_ASIGNAR", tecnicoNombre: "Sin asignar" });
    }

    const similitudActual = similitudesMap.get(categoria) || {
      categoria,
      count: 0,
      tecnicoCounts: new Map<string, { tecnicoId: string; tecnicoNombre: string; cantidad: number }>(),
      ejemplos: [],
    };
    similitudActual.count += 1;

    for (const tecnico of Array.from(tecnicosUnicos.values())) {
      const tecnicoCount = similitudActual.tecnicoCounts.get(tecnico.tecnicoId) || { ...tecnico, cantidad: 0 };
      tecnicoCount.cantidad += 1;
      similitudActual.tecnicoCounts.set(tecnico.tecnicoId, tecnicoCount);

      const currentTecnico = porTecnicoNoConforme.get(tecnico.tecnicoId) || {
        tecnicoId: tecnico.tecnicoId,
        tecnicoNombre: tecnico.tecnicoNombre,
        totalNoConformes: 0,
        conMotivo: 0,
        sinMotivo: 0,
        categorias: new Map<string, number>(),
        keywords: new Map<string, number>(),
      };
      currentTecnico.totalNoConformes += 1;
      if (hasMotivo) currentTecnico.conMotivo += 1;
      else currentTecnico.sinMotivo += 1;
      currentTecnico.categorias.set(categoria, (currentTecnico.categorias.get(categoria) || 0) + 1);
      for (const keyword of keywords) {
        currentTecnico.keywords.set(keyword, (currentTecnico.keywords.get(keyword) || 0) + 1);
      }
      porTecnicoNoConforme.set(tecnico.tecnicoId, currentTecnico);
    }

    if (similitudActual.ejemplos.length < 4) {
      similitudActual.ejemplos.push({
        predio: predio.codigo || predio.nombre || "Sin codigo",
        motivo: motivo || "Sin detalle cargado",
        tecnicoNombre: Array.from(tecnicosUnicos.values()).map((t) => t.tecnicoNombre).join(", "),
      });
    }
    similitudesMap.set(categoria, similitudActual);
  }

  const similitudes = Array.from(similitudesMap.values())
    .map((item) => ({
      categoria: item.categoria,
      count: item.count,
      tecnicosAfectados: item.tecnicoCounts.size,
      tecnicos: Array.from(item.tecnicoCounts.values()).sort((a, b) => b.cantidad - a.cantidad || a.tecnicoNombre.localeCompare(b.tecnicoNombre, "es")).slice(0, 6),
      ejemplos: item.ejemplos,
    }))
    .sort((a, b) => b.count - a.count || b.tecnicosAfectados - a.tecnicosAfectados);

  const porTecnico = Array.from(porTecnicoNoConforme.values())
    .map((item) => {
      const categorias = Array.from(item.categorias.entries())
        .map(([categoria, count]) => ({ categoria, count }))
        .sort((a, b) => b.count - a.count || a.categoria.localeCompare(b.categoria, "es"));
      const keywords = Array.from(item.keywords.entries())
        .map(([termino, count]) => ({ termino, count }))
        .sort((a, b) => b.count - a.count || a.termino.localeCompare(b.termino, "es"));
      return {
        tecnicoId: item.tecnicoId,
        tecnicoNombre: item.tecnicoNombre,
        totalNoConformes: item.totalNoConformes,
        conMotivo: item.conMotivo,
        sinMotivo: item.sinMotivo,
        principalCategoria: categorias[0]?.categoria || "Sin categoria",
        principalCategoriaCount: categorias[0]?.count || 0,
        categorias: categorias.slice(0, 4),
        palabrasClave: keywords.slice(0, 6),
      };
    })
    .sort((a, b) => b.totalNoConformes - a.totalNoConformes || a.tecnicoNombre.localeCompare(b.tecnicoNombre, "es"));

  const topPalabras = Array.from(keywordCounts.entries())
    .map(([termino, count]) => ({ termino, count }))
    .sort((a, b) => b.count - a.count || a.termino.localeCompare(b.termino, "es"))
    .slice(0, 20);

  const noConformidadesSemanales = {
    semana: getISOWeek(startOfWeek),
    desde: startOfWeek.toISOString(),
    hasta: endOfWeek.toISOString(),
    totalNoConformes: noConformesSemana.length,
    conMotivo: noConformesSemana.filter((predio) => Boolean(getNoConformeReason(predio).motivo?.trim())).length,
    sinMotivo: noConformesSemana.filter((predio) => !getNoConformeReason(predio).motivo?.trim()).length,
    similitudes: similitudes.slice(0, 8),
    topPalabras,
    porTecnico,
  };

  let produccionSemanal = null;

  if (session.rol === "ADMIN") {
    const estadosProduccion = await prisma.estadoConfig.findMany({
      where: { clave: { in: ["conforme", "no_conforme"] }, activo: true },
      select: { id: true, clave: true, nombre: true, color: true },
    });
    const estadoProduccionMap = new Map(estadosProduccion.map((estado) => [estado.id, estado]));
    const estadoProduccionIds = estadosProduccion.map((estado) => estado.id);

    const prediosProduccion = estadoProduccionIds.length > 0
      ? await prisma.predio.findMany({
          where: {
            estadoId: { in: estadoProduccionIds },
            fechaActualizacion: { gte: startOfWeek, lte: endOfWeek },
          },
          select: {
            id: true,
            estadoId: true,
            asignaciones: {
              where: { tipo: { in: ["TAREA", "TECNICO"] } },
              include: { usuario: { select: { id: true, nombre: true } } },
            },
          },
          orderBy: { fechaActualizacion: "desc" },
        })
      : [];

    const porTecnico = new Map<string, { tecnicoId: string; tecnicoNombre: string; total: number; conformes: number; noConformes: number }>();
    let conformesSemana = 0;
    let noConformesSemana = 0;

    for (const predio of prediosProduccion) {
      const estado = predio.estadoId ? estadoProduccionMap.get(predio.estadoId) : null;
      const esNoConforme = estado?.clave === "no_conforme";
      if (esNoConforme) noConformesSemana += 1;
      else conformesSemana += 1;

      const uniqueTargets = new Map<string, { id: string; nombre: string }>();
      for (const asignacion of predio.asignaciones) {
        const tecnico = asignacion.usuario;
        const resolvedKey = resolveEquipoKey(tecnico.nombre);
        const mergeKey = resolvedKey || normalizeAssigneeName(tecnico.nombre) || tecnico.id;
        if (!mergeKey || uniqueTargets.has(mergeKey)) continue;
        uniqueTargets.set(mergeKey, {
          id: mergeKey,
          nombre: getEquipoDisplayName(resolvedKey || tecnico.nombre),
        });
      }

      if (uniqueTargets.size === 0) {
        uniqueTargets.set("SIN_ASIGNAR", { id: "SIN_ASIGNAR", nombre: "Sin asignar" });
      }

      for (const tecnico of Array.from(uniqueTargets.values())) {
        const current = porTecnico.get(tecnico.id) || {
          tecnicoId: tecnico.id,
          tecnicoNombre: tecnico.nombre,
          total: 0,
          conformes: 0,
          noConformes: 0,
        };
        current.total += 1;
        if (esNoConforme) current.noConformes += 1;
        else current.conformes += 1;
        porTecnico.set(tecnico.id, current);
      }
    }

    produccionSemanal = {
      semana: getISOWeek(startOfWeek),
      desde: startOfWeek.toISOString(),
      hasta: endOfWeek.toISOString(),
      total: prediosProduccion.length,
      conformes: conformesSemana,
      noConformes: noConformesSemana,
      porTecnico: Array.from(porTecnico.values()).sort((a, b) => b.total - a.total || a.tecnicoNombre.localeCompare(b.tecnicoNombre, "es")),
    };
  }

  // Progreso general (% de predios con estado "conforme" o similar)
  const conformeCount = byEstado
    .filter((e) => e.nombre.toLowerCase().includes("conforme") && !e.nombre.toLowerCase().includes("no conforme"))
    .reduce((sum, e) => sum + e.count, 0);

  const responseData = {
    predios: {
      total: prediosTotal,
      conRed: prediosConRed,
      conGPS: prediosConGPS,
      conformes: conformeCount,
      progreso: prediosTotal > 0 ? Math.round((conformeCount / prediosTotal) * 100) : 0,
      byEstado,
      byAsignado,
      byProvincia,
      byAmbito,
    },
    tareas: {
      pendientes: tareasPendientes,
      hoy: tareasHoy,
      completadasSemana: tareasCompletadasSemana,
      completadasMes: tareasCompletadasMes,
    },
    equipos: {
      disponibles: equiposDisponibles,
      asignados: equiposAsignados,
      rotos: equiposRotos,
    },
    operacion: {
      usuariosActivos,
      actividadSemana,
      notificacionesPendientes: notificacionesSinLeerTotal,
    },
    noConformidadesSemanales,
    ...(produccionSemanal ? { produccionSemanal } : {}),
  };

  cachedKpis[cacheKey] = { exp: Date.now() + KPI_CACHE_TTL_MS, data: responseData };

  return NextResponse.json(responseData, {
    headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=30" },
  });
}

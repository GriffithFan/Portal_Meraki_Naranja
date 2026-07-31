import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/**
 * Arma el contexto de conocimiento del Asistente THNET:
 *  1) Base de conocimiento consolidada (archivo .md bundleado, ESTÁTICO).
 *  2) Consultas reales de los chats de Mesa (dinámico, desde la BD).
 *  3) Motivos de no conformidades registrados (dinámico, desde la BD).
 */

// ─── Persona / reglas (derivadas de las secciones 64-68 de la base) ───
export const PERSONA_ASISTENTE = `Sos el **Asistente de THNET** para el proyecto "Piso Tecnológico Educar — Red USAP". Ayudás a técnicos de campo, Mesa de Ayuda, referentes y coordinación con consultas operativas, técnicas y administrativas.

REGLAS DE RESPUESTA:
- Respondé SOLO con la información de la BASE DE CONOCIMIENTO y del CONTEXTO que te paso (consultas reales de chats y motivos de no conformidades). No inventes números de serie, estados de equipos, credenciales, datos de predios ni autorizaciones.
- Español rioplatense claro y directo. Para procedimientos, usá listas numeradas con pasos accionables.
- Poné las ADVERTENCIAS DE SEGURIDAD antes de cualquier instrucción técnica. Nunca indiques una intervención eléctrica insegura: ante riesgo, indicá detener la tarea y escalar.
- Distinguí entre "debe" (obligación operativa), "se recomienda" y "objetivo del roadmap".
- Cuando corresponda, indicá qué evidencia/fotos hacen falta y qué registrar en Carrot y en las actas.
- Mencioná a Mesa de Ayuda cuando la situación requiere autorización, reemplazo, intervención fuera del alcance o escalamiento.
- Para consultas sobre una incidencia, preferí responder con: qué verificar → qué acción → cuándo escalar → cómo probar → qué registrar en Carrot y actas → qué fotos tomar.
- Si la base NO tiene la respuesta: decilo con claridad ("No tengo un procedimiento confirmado para eso"), no sugieras una intervención no autorizada y recomendá consultar a Mesa de Ayuda THNET.
- No pidas ni reveles contraseñas, tokens ni secretos.
- Sé conciso: respondé lo que se preguntó, sin relleno.`;

// ─── Base de conocimiento estática (cacheada en memoria) ───
let baseCache: string | null = null;

export function cargarBaseConocimiento(): string {
  if (baseCache !== null) return baseCache;
  try {
    baseCache = readFileSync(
      path.join(process.cwd(), "src/lib/asistente/conocimiento/base-conocimiento.md"),
      "utf8"
    );
  } catch {
    baseCache = "";
  }
  return baseCache;
}

// ─── Límites de contexto (acotan tokens/costo; sobra para Haiku 200k) ───
const MAX_CONVERSACIONES = 40;
const MAX_MENSAJES_POR_CONV = 16;
const MAX_NC = 120;

function recortar(s: string | null | undefined, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Consultas reales de los chats de Mesa (preguntas de técnicos y su resolución). */
async function contextoChats(): Promise<string> {
  const convs = await prisma.chatConversacion.findMany({
    orderBy: { updatedAt: "desc" },
    take: MAX_CONVERSACIONES,
    select: {
      asunto: true,
      creadorId: true,
      mensajes: {
        where: { eliminadoAt: null },
        orderBy: { createdAt: "asc" },
        take: MAX_MENSAJES_POR_CONV,
        select: { contenido: true, autorId: true },
      },
    },
  });

  const bloques: string[] = [];
  for (const conv of convs) {
    const msgs = conv.mensajes.filter((m) => (m.contenido || "").trim());
    if (msgs.length === 0) continue;
    const lineas = msgs.map((m) => {
      const quien = m.autorId === conv.creadorId ? "Técnico" : "Mesa";
      return `${quien}: ${recortar(m.contenido, 500)}`;
    });
    bloques.push(`### Consulta${conv.asunto ? `: ${recortar(conv.asunto, 120)}` : ""}\n${lineas.join("\n")}`);
  }

  if (bloques.length === 0) return "";
  return `# CONSULTAS REALES DE LOS CHATS (Mesa de Ayuda)\nEjemplos reales de preguntas de técnicos y cómo se resolvieron. Usalos como referencia de casos frecuentes y de cómo responde Mesa. No copies datos puntuales (predios, seriales) de estos ejemplos a otras respuestas.\n\n${bloques.join("\n\n")}`;
}

/** Motivos de no conformidades registrados (notas/comentarios de predios NO CONFORME). */
async function contextoNoConformidades(): Promise<string> {
  const estados = await prisma.estadoConfig.findMany({ select: { id: true, nombre: true, clave: true } });
  const ncIds = estados
    .filter((e) => {
      const l = `${e.clave || ""} ${e.nombre || ""}`.toLowerCase();
      return l.includes("no conforme") || l.includes("noconforme") || l.trim() === "nc";
    })
    .map((e) => e.id);
  if (ncIds.length === 0) return "";

  const predios = await prisma.predio.findMany({
    where: { estadoId: { in: ncIds } },
    orderBy: { updatedAt: "desc" },
    take: MAX_NC,
    select: {
      codigo: true,
      notas: true,
      comentarios: { orderBy: { createdAt: "desc" }, take: 1, select: { contenido: true } },
    },
  });

  const lineas: string[] = [];
  for (const p of predios) {
    const motivo = (p.notas?.trim() || p.comentarios[0]?.contenido?.trim() || "");
    if (!motivo) continue;
    lineas.push(`- Predio ${p.codigo || "?"}: ${recortar(motivo, 300)}`);
  }

  if (lineas.length === 0) return "";
  return `# MOTIVOS DE NO CONFORMIDADES (registrados en el sistema)\nMotivos reales por los que se rechazaron predios. Sirven para explicar por qué se rechaza y cómo prevenirlo. (Ver también la estadística de NC frecuentes en la base de conocimiento.)\n\n${lineas.join("\n")}`;
}

/** Junta el contexto dinámico (chats + NC). Best-effort: si algo falla, no rompe. */
export async function construirContextoDinamico(): Promise<string> {
  const [chats, nc] = await Promise.all([
    contextoChats().catch(() => ""),
    contextoNoConformidades().catch(() => ""),
  ]);
  return [chats, nc].filter(Boolean).join("\n\n---\n\n");
}

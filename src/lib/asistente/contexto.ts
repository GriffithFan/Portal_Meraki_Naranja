import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/**
 * Arma el contexto de conocimiento del Asistente THNET:
 *  1) Base de conocimiento consolidada (archivo .md bundleado, ESTÁTICO).
 *  2) Consultas reales de los chats de Mesa (dinámico, desde la BD).
 *  3) Motivos de no conformidades registrados (dinámico, desde la BD).
 */

// ─── Persona / reglas: responder COMO MESA DE AYUDA (corto y natural) ───
export const PERSONA_ASISTENTE = `Sos el asistente de Mesa de Ayuda de THNET (proyecto "Piso Tecnológico Educar — Red USAP"). Le respondés a técnicos que están en el campo, en el techo o frente al rack, y necesitan una respuesta rápida y clara — no un manual.

CÓMO RESPONDER (imitá a Mesa de Ayuda):
- Hablá como un compañero de Mesa por chat: breve, directo y en criollo rioplatense, tono amable y práctico ("dale", "probá", "fijate", "avisanos").
- CORTÍSIMO. Casi siempre 1 a 3 frases en TEXTO CORRIDO. Nada de títulos, tablas, checklists, negritas (**) ni encabezados. Escribí como en un chat de WhatsApp, no como un manual.
- Evitá las listas numeradas. Solo si son de verdad varios pasos, poné una lista simple de 2 o 3 ítems como mucho, sin negrita. Si te salen 5 pasos, estás escribiendo de más: quedate con los 2 más probables.
- Dale primero lo más probable que lo soluciona. No enumeres todas las causas posibles: arrancá por la más común y, si no funciona, seguís en el próximo mensaje.
- Si te falta un dato para ayudar (qué predio, qué ya probó, qué LED/estado), preguntáselo corto al final, como Mesa ("¿de qué predio es?", "¿probaste con otro patchcord?").
- Mirá las CONSULTAS REALES DE LOS CHATS que te paso: ESE es el estilo, el tono y el largo con el que responde Mesa. Copialo. Si dudás entre corto y largo, elegí corto.

REGLAS:
- Respondé SOLO con la BASE DE CONOCIMIENTO y el CONTEXTO que te doy. Esto es MUY específico de THNET: NO uses conocimiento general de internet ni inventes nada (seriales, estados, datos de predios, autorizaciones).
- Si algo no está en el material, decilo corto y mandalo a Mesa de Ayuda. No te inventes un procedimiento.
- Seguridad primero: si hay riesgo eléctrico o algo fuera del alcance del técnico, decile que pare y escale — también corto.
- No pidas ni reveles contraseñas, tokens ni secretos.

Ejemplos del tono buscado (así de corto):

Técnico: "tengo un AP en amarillo a 100mb, ¿cómo lo arreglo?"
Vos: "Casi siempre es el cable. Probá cambiando el patchcord del AP por uno que ande en giga; si sigue en 100, revisá la roseta y el conector del AP que no tenga hilos sueltos o mal armados. Y si en otro puerto del switch engancha giga, el puerto anterior está fallado → avisanos. ¿De qué predio es y qué llegaste a probar?"

Técnico: "el switch me quedó en rojo, no levanta"
Vos: "Fijate primero que esté enchufado al filtro de tensión y que el filtro tenga el testigo azul prendido. Si está todo bien, desenchufá y volvé a enchufar el switch y esperá un par de minutos. ¿Qué LEDs te quedan? ¿el filtro tiene el azul?"

Técnico: "¿dónde va el módem del ISP?"
Vos: "Dentro del rack, mejor en la bandeja de arriba. Si no entra, dejalo conectado por UTP bien canalizado y sacale foto al módem y al recorrido. ¿Está adentro o afuera en el predio?"

Técnico: "¿cómo conecto un predio que quedó sin internet?" (aunque el manual tenga una lista larga de chequeos, comprimila a lo más probable y ofrecé seguir)
Vos: "Empezá por lo básico: fijate si el filtro de tensión tiene el testigo azul y si el módem del ISP está prendido con el LED de enlace. Después mirá que el cable de WAN esté puesto en el UTM (WAN1 el del proyecto). Si el ISP está caído, probá con la conexión propia en WAN2 y dejá todo aclarado en el acta. ¿Qué viste al llegar, qué LEDs tenés prendidos?"

Técnico: "tengo que reemplazar un AP, ¿cómo registro el cambio?" (procedimiento administrativo: igual respondé compacto, en frases, sin numerar cada subpunto)
Vos: "Anotá los dos seriales: el viejo como BAJA y el nuevo como ALTA, tanto en la Hoja 2 (ABM) como en la Hoja 3. Cargalo en Carrot, rotulá el nuevo y sacale foto funcionando (caja abierta, LED azul, serial legible). Antes de irte fijate que serial, Carrot y acta coincidan. ¿Tenés el serial del AP nuevo?"`;

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

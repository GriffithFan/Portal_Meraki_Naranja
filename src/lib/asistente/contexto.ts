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

DATOS DEL PREDIO (cuando el técnico menciona un número de predio):
- Te paso un bloque "DATOS DEL PREDIO …" con la info REAL de Carrot (estado, LAC-R, último comentario, incidencia, etc.). Usá ESOS datos, NO adivines ni inventes.
- Si te preguntan si el predio "tiene LAC" o "LAC-R", respondé según el campo LAC-R: si dice SI, tiene; si dice NO, no tiene. No lo confundas con las evidencias/actas.
- Si el predio está NO CONFORME, el motivo es el ÚLTIMO comentario (el de fecha más reciente): decilo puntual y ayudá a resolver justo eso, no todo el checklist.
- Si NO te paso datos de ese predio (no aparece en Carrot), decilo y pedí que verifique el número; no inventes su estado.

REGLA FIJA DE THNET (tiene prioridad sobre cualquier otra cosa):
- Al recargar o levantar un predio NO CONFORME, SIEMPRE, sin excepción: se completan/actualizan las ACTAS, se informa en el acta el trabajo realizado para levantar el no conforme (qué se corrigió) y se toma FOTO DEL FRENTE del predio. Esto va aunque el rechazo haya sido por una sola evidencia (por ej. solo faltaba el PDU). Nunca digas que "las actas ya están y no hace falta tocarlas".

FUENTE (obligatorio): terminá SIEMPRE con una ÚLTIMA línea aparte, exactamente con este formato: [fuente: X]. En X poné en qué te apoyaste: "base de conocimiento", "instructivo <título>", "consultas de Mesa", "datos del predio <código>", o varias separadas por coma. Si NO encontraste la respuesta en el material, poné [fuente: sin dato]. No menciones la fuente en el cuerpo del mensaje, solo en esa última línea.

Ejemplos del tono buscado (así de corto; fijate que TODOS terminan con la línea [fuente: ...]):

Técnico: "tengo un AP en amarillo a 100mb, ¿cómo lo arreglo?"
Vos: "Casi siempre es el cable. Probá cambiando el patchcord del AP por uno que ande en giga; si sigue en 100, revisá la roseta y el conector del AP que no tenga hilos sueltos o mal armados. Y si en otro puerto del switch engancha giga, el puerto anterior está fallado → avisanos. ¿De qué predio es y qué llegaste a probar?
[fuente: base de conocimiento]"

Técnico: "el switch me quedó en rojo, no levanta"
Vos: "Fijate primero que esté enchufado al filtro de tensión y que el filtro tenga el testigo azul prendido. Si está todo bien, desenchufá y volvé a enchufar el switch y esperá un par de minutos. ¿Qué LEDs te quedan? ¿el filtro tiene el azul?
[fuente: base de conocimiento]"

Técnico: "¿dónde va el módem del ISP?"
Vos: "Dentro del rack, mejor en la bandeja de arriba. Si no entra, dejalo conectado por UTP bien canalizado y sacale foto al módem y al recorrido. ¿Está adentro o afuera en el predio?
[fuente: base de conocimiento]"

Técnico: "¿cómo conecto un predio que quedó sin internet?" (aunque el manual tenga una lista larga de chequeos, comprimila a lo más probable y ofrecé seguir)
Vos: "Empezá por lo básico: fijate si el filtro de tensión tiene el testigo azul y si el módem del ISP está prendido con el LED de enlace. Después mirá que el cable de WAN esté puesto en el UTM (WAN1 el del proyecto). Si el ISP está caído, probá con la conexión propia en WAN2 y dejá todo aclarado en el acta. ¿Qué viste al llegar, qué LEDs tenés prendidos?
[fuente: base de conocimiento]"

Técnico: "el 821972 tiene lac?" (con datos del predio)
Vos: "Sí, el 821972 tiene LAC-R. ¿Qué necesitás revisar del predio?
[fuente: datos del predio 821972]"

Técnico: "tengo que reemplazar un AP, ¿cómo registro el cambio?" (procedimiento administrativo: igual respondé compacto, en frases, sin numerar cada subpunto)
Vos: "Anotá los dos seriales: el viejo como BAJA y el nuevo como ALTA, tanto en la Hoja 2 (ABM) como en la Hoja 3. Cargalo en Carrot, rotulá el nuevo y sacale foto funcionando (caja abierta, LED azul, serial legible). Antes de irte fijate que serial, Carrot y acta coincidan. ¿Tenés el serial del AP nuevo?
[fuente: base de conocimiento]"`;

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
const MAX_CONVERSACIONES = 70;
const MAX_MENSAJES_POR_CONV = 16;
const MAX_NC = 120;

function recortar(s: string | null | undefined, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

// Ruido de chat que no aporta al conocimiento: adjuntos (nombre de archivo) y
// acks/saludos sueltos. Se filtran para que entren consultas con sustancia.
const EXT_ARCHIVO = /\.(jpe?g|png|gif|webp|bmp|heic|mp4|mov|avi|webm|mp3|ogg|wav|m4a|pdf|zip|rar|docx?|xlsx?|pptx?)$/i;
const ACKS = new Set([
  "dale", "dale dale", "ok", "oka", "okey", "okok", "listo", "gracias", "graciass", "gracias!", "buenas",
  "buen dia", "buenos dias", "hola", "si", "sisi", "sii", "no", "nn", "va", "vale", "joya", "genial",
  "perfecto", "bien", "ah", "aja", "ya", "yap", "ahi", "ahi va", "de una", "barbaro", "tal cual", "👍", "👌",
]);

function esMensajeUtil(contenido: string | null | undefined): boolean {
  const t = (contenido || "").replace(/\s+/g, " ").trim();
  if (t.length < 3) return false;
  if (EXT_ARCHIVO.test(t)) return false;
  if (ACKS.has(t.toLowerCase())) return false;
  return true;
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
    const msgs = conv.mensajes.filter((m) => esMensajeUtil(m.contenido));
    // Solo conversaciones con ida y vuelta con sustancia (pregunta del técnico + respuesta de Mesa).
    const hayTecnico = msgs.some((m) => m.autorId === conv.creadorId);
    const hayMesa = msgs.some((m) => m.autorId !== conv.creadorId);
    if (msgs.length < 2 || !hayTecnico || !hayMesa) continue;
    const lineas = msgs.map((m) => {
      const quien = m.autorId === conv.creadorId ? "Técnico" : "Mesa";
      return `${quien}: ${recortar(m.contenido, 500)}`;
    });
    bloques.push(`### Consulta${conv.asunto ? `: ${recortar(conv.asunto, 120)}` : ""}\n${lineas.join("\n")}`);
    if (bloques.length >= 50) break; // tope de conversaciones útiles incluidas
  }

  if (bloques.length === 0) return "";
  return `# CONSULTAS REALES DE LOS CHATS (Mesa de Ayuda)\nEjemplos reales de preguntas de técnicos y cómo se resolvieron. Usalos como referencia de casos frecuentes y de cómo responde Mesa (tono y largo). No copies datos puntuales (predios, seriales) de estos ejemplos a otras respuestas.\n\n${bloques.join("\n\n")}`;
}

/** Situaciones curadas por admins (pregunta típica → respuesta correcta). Prioritarias. */
async function contextoSituaciones(): Promise<string> {
  const situaciones = await prisma.situacion.findMany({
    where: { activo: true },
    orderBy: [{ categoria: "asc" }, { orden: "asc" }],
    select: { pregunta: true, respuesta: true, categoria: true, palabrasClave: true },
  });
  if (situaciones.length === 0) return "";
  const bloques = situaciones.map((s) => {
    const kw = s.palabrasClave?.trim() ? ` (también: ${recortar(s.palabrasClave, 120)})` : "";
    return `### [${s.categoria}] ${recortar(s.pregunta, 200)}${kw}\nRESPUESTA CORRECTA: ${recortar(s.respuesta, 1500)}`;
  });
  return `# RESPUESTAS CURADAS POR EL EQUIPO — MÁXIMA PRIORIDAD\nEstas fueron revisadas y APROBADAS por el equipo de Mesa. Si la consulta del técnico coincide (por tema o por palabras clave) con alguna de estas preguntas, tu respuesta DEBE basarse en ESA respuesta correcta, AUNQUE la base de conocimiento diga algo distinto o menos completo. Mantené el tono corto de Mesa, pero el contenido sale de acá.\n\n${bloques.join("\n\n")}`;
}

/** Instructivos cargados en Carrot (conocimiento oficial; muchos son PDF/imagen/video). */
async function contextoInstructivos(): Promise<string> {
  const instructivos = await prisma.instructivo.findMany({
    where: { activo: true },
    orderBy: [{ categoria: "asc" }, { orden: "asc" }],
    select: { titulo: true, descripcion: true, contenido: true, categoria: true, pdfNombre: true, imagenNombre: true, videoNombre: true },
  });
  const bloques: string[] = [];
  for (const i of instructivos) {
    const partes = [`### [${i.categoria}] ${i.titulo}`];
    const texto = (i.contenido || i.descripcion || "").trim();
    if (texto) partes.push(recortar(texto, 2500));
    const media = [i.pdfNombre && "PDF", i.imagenNombre && "imagen", i.videoNombre && "video"].filter(Boolean);
    if (media.length) {
      partes.push(`(Instructivo disponible como ${media.join("/")} en la sección Instructivos de Carrot${texto ? "" : "; para el detalle indicale al técnico que lo abra ahí"}.)`);
    }
    bloques.push(partes.join("\n"));
  }
  if (bloques.length === 0) return "";
  return `# INSTRUCTIVOS DE THNET (sección Instructivos de Carrot)\nSon los instructivos oficiales disponibles. Si un tema está cubierto por uno, podés mencionarlo por su título para que el técnico lo abra.\n\n${bloques.join("\n\n")}`;
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

function fechaAR(d: Date | null | undefined): string {
  if (!d) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Extrae códigos de predio (6-8 dígitos) mencionados por el técnico en el chat. */
export function extraerCodigosPredio(mensajes: { role: string; content: string }[]): string[] {
  const set = new Set<string>();
  for (const m of mensajes) {
    if (m.role !== "user") continue;
    const matches = (m.content || "").match(/\b\d{6,8}\b/g);
    if (matches) for (const c of matches) set.add(c);
  }
  return Array.from(set).slice(0, 5);
}

/**
 * Datos REALES de los predios mencionados (de Carrot / tareas): estado, LAC-R,
 * ubicación, incidencia, cronograma y los últimos comentarios (el más reciente
 * es el "motivo" cuando está NO CONFORME). Así el bot responde con datos, no adivina.
 */
export async function contextoPrediosMencionados(codigos: string[]): Promise<string> {
  if (!codigos || codigos.length === 0) return "";

  const predios = await prisma.predio.findMany({
    where: { codigo: { in: codigos } },
    select: {
      codigo: true, nombre: true, nombreInstitucion: true,
      estado: { select: { nombre: true } },
      lacR: true, ambito: true, ciudad: true, provincia: true,
      incidencias: true, tipoIncidencia: true, notas: true, notasTecnico: true,
      fechaDesde: true, fechaHasta: true,
      comentarios: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { contenido: true, createdAt: true, usuario: { select: { nombre: true } } },
      },
    },
  });

  const encontrados = new Set(predios.map((p) => p.codigo));
  const bloques: string[] = [];

  for (const p of predios) {
    const lac = (p.lacR || "").trim().toUpperCase();
    const lacTxt = lac === "SI" ? "SI (tiene LAC-R)" : lac === "NO" ? "NO (no tiene LAC-R)" : "sin dato";
    const lineas = [`- Estado: ${p.estado?.nombre || "sin estado"}`, `- LAC-R: ${lacTxt}`];
    if (p.nombreInstitucion || p.nombre) lineas.push(`- Institución: ${p.nombreInstitucion || p.nombre}`);
    const ubic = [p.ambito, p.ciudad, p.provincia].filter(Boolean).join(" · ");
    if (ubic) lineas.push(`- Ubicación: ${ubic}`);
    if (p.incidencias) lineas.push(`- Incidencia: ${p.incidencias}${p.tipoIncidencia ? ` (${p.tipoIncidencia})` : ""}`);
    if (p.fechaDesde || p.fechaHasta) lineas.push(`- Cronograma: ${fechaAR(p.fechaDesde)} a ${fechaAR(p.fechaHasta)}`);

    const comentarios = p.comentarios.filter((c) => (c.contenido || "").trim());
    if (comentarios.length > 0) {
      const u = comentarios[0];
      lineas.push(`- Último comentario / motivo (${fechaAR(u.createdAt)}${u.usuario?.nombre ? `, ${u.usuario.nombre}` : ""}): ${recortar(u.contenido, 400)}`);
      for (const c of comentarios.slice(1)) {
        lineas.push(`  · Comentario previo (${fechaAR(c.createdAt)}): ${recortar(c.contenido, 200)}`);
      }
    }
    if (p.notas?.trim()) lineas.push(`- Notas: ${recortar(p.notas, 300)}`);
    bloques.push(`## DATOS DEL PREDIO ${p.codigo}\n${lineas.join("\n")}`);
  }

  for (const c of codigos.filter((x) => !encontrados.has(x))) {
    bloques.push(`## DATOS DEL PREDIO ${c}\n- No aparece en Carrot con ese número. Pedile al técnico que verifique el número; no inventes su estado.`);
  }

  if (bloques.length === 0) return "";
  return `# DATOS REALES DE PREDIOS MENCIONADOS (de Carrot / tareas)\nUsá estos datos para responder sobre el predio (estado, LAC-R, y si es NO CONFORME el motivo = el último comentario). No adivines.\n\n${bloques.join("\n\n")}`;
}

/** Junta el contexto dinámico (situaciones + instructivos + chats + NC). Best-effort. */
export async function construirContextoDinamico(): Promise<string> {
  const [situaciones, instructivos, chats, nc] = await Promise.all([
    contextoSituaciones().catch(() => ""),
    contextoInstructivos().catch(() => ""),
    contextoChats().catch(() => ""),
    contextoNoConformidades().catch(() => ""),
  ]);
  // Las situaciones curadas van ÚLTIMAS (lo más saliente, justo antes de la consulta)
  // para que tengan prioridad real sobre la base y los ejemplos.
  return [instructivos, chats, nc, situaciones].filter(Boolean).join("\n\n---\n\n");
}

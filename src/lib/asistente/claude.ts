import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente de Claude para el Asistente THNET (solo ADMIN, en pruebas).
 * La API key vive en el .env del servidor (ANTHROPIC_API_KEY), nunca en el repo.
 * Modelo por defecto: Haiku 4.5 (rápido y barato para Q&A); configurable por env.
 */

let cliente: Anthropic | null = null;

function getCliente(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en el servidor (.env)");
  }
  if (!cliente) cliente = new Anthropic({ apiKey });
  return cliente;
}

export const MODELO_ASISTENTE = process.env.ASISTENTE_MODELO || "claude-haiku-4-5";

export interface MensajeChat {
  role: "user" | "assistant";
  content: string;
}

/**
 * Responde una consulta con Claude, apoyándose en:
 *  - `persona`: reglas de comportamiento del asistente (system, chico).
 *  - `baseConocimiento`: la base consolidada (system, grande y ESTÁTICO → se cachea).
 *  - `contextoDinamico`: consultas reales de chats + motivos de NC (system, fresco).
 *  - `mensajes`: el historial de la conversación con el admin.
 *
 * Usa streaming + `finalMessage()` para no chocar con timeouts de request, y
 * prompt caching sobre el bloque de conocimiento (lecturas ~0.1× del costo).
 */
export async function responderConsulta(params: {
  persona: string;
  baseConocimiento: string;
  contextoDinamico: string;
  mensajes: MensajeChat[];
}): Promise<{ texto: string; uso?: Anthropic.Usage }> {
  const c = getCliente();

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: params.persona },
  ];
  if (params.baseConocimiento.trim()) {
    system.push({
      type: "text",
      text: `# BASE DE CONOCIMIENTO CONSOLIDADA\n\n${params.baseConocimiento}`,
      cache_control: { type: "ephemeral" },
    });
  }
  if (params.contextoDinamico.trim()) {
    system.push({
      type: "text",
      text: params.contextoDinamico,
    });
  }

  const stream = c.messages.stream({
    model: MODELO_ASISTENTE,
    max_tokens: 600,
    system,
    messages: params.mensajes.map((m) => ({ role: m.role, content: m.content })),
  });

  const final = await stream.finalMessage();
  const texto = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { texto: texto || "No pude generar una respuesta. Probá reformular la consulta.", uso: final.usage };
}

/**
 * Convierte una conversación real de Mesa en un borrador de "situación" reutilizable
 * (pregunta típica generalizada + respuesta correcta en tono Mesa + categoría).
 * Devuelve null si la conversación no tiene una consulta técnica útil.
 */
export async function redactarSituacionDesdeChat(
  transcripcion: string
): Promise<{ pregunta: string; respuesta: string; categoria: string } | null> {
  const c = getCliente();
  const sys = `Convertís una conversación real de la Mesa de Ayuda de THNET (proyecto "Piso Tecnológico Educar") en una "situación" reutilizable para el asistente.
A partir de la conversación redactá:
- "pregunta": la consulta típica del técnico, GENERALIZADA (sin datos puntuales como número de predio, serial o nombres propios), como la haría cualquier técnico.
- "respuesta": la respuesta correcta que dio Mesa, en tono CORTO y directo de Mesa (criollo rioplatense), sin datos puntuales.
- "categoria": UNA de: "Equipos / Meraki", "Instalación", "Carrot (sistema)", "Procedimientos", "Actas y evidencia", "Escalamiento", "General".
Devolvé SOLO un JSON válido con esas tres claves. Si la conversación no tiene una consulta técnica útil (es solo saludos, adjuntos o coordinación), devolvé {"pregunta":"","respuesta":"","categoria":"General"}.`;

  const stream = c.messages.stream({
    model: MODELO_ASISTENTE,
    max_tokens: 800,
    system: sys,
    messages: [{ role: "user", content: transcripcion.slice(0, 12000) }],
  });
  const final = await stream.finalMessage();
  const texto = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  try {
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as { pregunta?: string; respuesta?: string; categoria?: string };
    return {
      pregunta: String(obj.pregunta || "").trim(),
      respuesta: String(obj.respuesta || "").trim(),
      categoria: String(obj.categoria || "General").trim() || "General",
    };
  } catch {
    return null;
  }
}

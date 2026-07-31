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

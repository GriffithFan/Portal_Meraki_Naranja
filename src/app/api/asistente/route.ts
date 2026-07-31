import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { responderConsulta, type MensajeChat } from "@/lib/asistente/claude";
import { PERSONA_ASISTENTE, cargarBaseConocimiento, construirContextoDinamico, extraerCodigosPredio, contextoPrediosMencionados } from "@/lib/asistente/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Asistente IA (en PRUEBAS, solo ADMIN). Responde con Claude apoyándose en la
 * base de conocimiento consolidada + las consultas reales de los chats + los
 * motivos de no conformidades. No toca el chat de los técnicos.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "El asistente está en pruebas: solo administradores" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "El asistente no está configurado (falta la API key en el servidor)" }, { status: 503 });
  }

  let body: { mensajes?: MensajeChat[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const entrada = Array.isArray(body?.mensajes) ? body.mensajes : [];
  const mensajes: MensajeChat[] = entrada
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));

  if (mensajes.length === 0 || mensajes[mensajes.length - 1].role !== "user") {
    return NextResponse.json({ error: "Enviá al menos una consulta" }, { status: 400 });
  }

  try {
    const baseConocimiento = cargarBaseConocimiento();
    // Datos reales de los predios que el técnico mencionó (van primero, por relevancia).
    const codigos = extraerCodigosPredio(mensajes);
    const [datosPredios, contextoBase] = await Promise.all([
      contextoPrediosMencionados(codigos).catch(() => ""),
      construirContextoDinamico(),
    ]);
    const contextoDinamico = [datosPredios, contextoBase].filter(Boolean).join("\n\n---\n\n");

    const { texto, uso } = await responderConsulta({
      persona: PERSONA_ASISTENTE,
      baseConocimiento,
      contextoDinamico,
      mensajes,
    });

    // Separar la etiqueta [fuente: ...] de la última línea (para el chip y la analítica).
    let respuesta = texto;
    let fuente: string | null = null;
    const mFuente = respuesta.match(/\n?\s*\[fuente:\s*([^\]]+)\]\s*$/i);
    if (mFuente && typeof mFuente.index === "number") {
      fuente = mFuente[1].trim();
      respuesta = respuesta.slice(0, mFuente.index).trim();
    }
    const tuvoRespuesta = !(fuente && /sin dato/i.test(fuente));

    // Registrar la consulta (voto 0) para revisión y analítica de huecos.
    let feedbackId: string | null = null;
    try {
      const fb = await prisma.asistenteFeedback.create({
        data: {
          pregunta: mensajes[mensajes.length - 1].content.slice(0, 4000),
          respuesta: respuesta.slice(0, 8000),
          fuente: fuente ? fuente.slice(0, 500) : null,
          codigosPredio: codigos.length ? codigos.join(",") : null,
          tuvoRespuesta,
          userId: session.userId,
        },
        select: { id: true },
      });
      feedbackId = fb.id;
    } catch (e) {
      console.error("[asistente] no se pudo registrar feedback:", (e as Error).message);
    }

    return NextResponse.json({
      respuesta,
      fuente,
      feedbackId,
      uso: uso
        ? {
            input: uso.input_tokens,
            output: uso.output_tokens,
            cacheRead: (uso as unknown as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
          }
        : undefined,
    });
  } catch (e) {
    const msg = (e as Error).message || "Error del asistente";
    console.error("[asistente] error:", msg);
    const publico = msg.includes("ANTHROPIC_API_KEY")
      ? "Falta configurar la API key del asistente en el servidor"
      : "El asistente no pudo responder. Probá de nuevo en unos segundos.";
    return NextResponse.json({ error: publico }, { status: 502 });
  }
}

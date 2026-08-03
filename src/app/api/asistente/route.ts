import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { responderConsulta, type MensajeChat } from "@/lib/asistente/claude";
import { PERSONA_ASISTENTE, cargarBaseConocimiento, construirContextoDinamico, extraerCodigosPredio, contextoPrediosMencionados } from "@/lib/asistente/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function recortar(s: string, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * Asistente IA (en PRUEBAS, solo ADMIN). Responde con Claude apoyándose en la base
 * de conocimiento + consultas de chats + motivos NC + datos reales de predios.
 * Persiste la conversación (historial) y soporta responder a un mensaje específico.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "El asistente está en pruebas: solo administradores" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "El asistente no está configurado (falta la API key en el servidor)" }, { status: 503 });
  }

  let body: { conversacionId?: string; texto?: string; replyToId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const texto = String(body?.texto || "").trim().slice(0, 4000);
  if (!texto) return NextResponse.json({ error: "Enviá al menos una consulta" }, { status: 400 });

  // 1. Resolver o crear la conversación.
  let conv: { id: string; titulo: string | null };
  if (body.conversacionId) {
    const found = await prisma.asistenteConversacion.findFirst({
      where: { id: body.conversacionId, userId: session.userId },
      select: { id: true, titulo: true },
    });
    if (!found) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    conv = found;
  } else {
    conv = await prisma.asistenteConversacion.create({
      data: { userId: session.userId, titulo: recortar(texto, 60) },
      select: { id: true, titulo: true },
    });
  }

  // 2. Historial de la conversación (para el contexto del modelo).
  const historial = await prisma.asistenteMensaje.findMany({
    where: { conversacionId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 40,
    select: { rol: true, contenido: true },
  });

  // 3. Mensaje al que se responde (si aplica).
  let replyTo: { id: string; rol: string; contenido: string } | null = null;
  if (body.replyToId) {
    replyTo = await prisma.asistenteMensaje.findFirst({
      where: { id: body.replyToId, conversacionId: conv.id },
      select: { id: true, rol: true, contenido: true },
    });
  }

  // 4. Guardar el mensaje del usuario.
  const userMsg = await prisma.asistenteMensaje.create({
    data: { conversacionId: conv.id, rol: "user", contenido: texto, replyToId: replyTo?.id || null },
    select: { id: true, rol: true, contenido: true, replyToId: true, createdAt: true },
  });

  try {
    // 5. Armar los mensajes para Claude: historial + consulta (con nota de reply si aplica).
    const mensajesClaude: MensajeChat[] = historial
      .filter((m) => (m.rol === "user" || m.rol === "assistant") && m.contenido.trim())
      .map((m) => ({ role: m.rol as "user" | "assistant", content: m.contenido }));
    let contenidoConsulta = texto;
    if (replyTo) {
      const quien = replyTo.rol === "user" ? "mi mensaje anterior" : "tu respuesta anterior";
      contenidoConsulta = `(Respondiendo a ${quien}: "${recortar(replyTo.contenido, 300)}")\n${texto}`;
    }
    mensajesClaude.push({ role: "user", content: contenidoConsulta });
    const mensajes = mensajesClaude.slice(-20);

    // 6. Contexto (base + situaciones + chats + NC + datos de predios mencionados).
    const baseConocimiento = cargarBaseConocimiento();
    const codigos = extraerCodigosPredio(mensajes);
    const [datosPredios, contextoBase] = await Promise.all([
      contextoPrediosMencionados(codigos).catch(() => ""),
      construirContextoDinamico(),
    ]);
    const contextoDinamico = [datosPredios, contextoBase].filter(Boolean).join("\n\n---\n\n");

    const { texto: salida } = await responderConsulta({ persona: PERSONA_ASISTENTE, baseConocimiento, contextoDinamico, mensajes });

    // 7. Separar la etiqueta [fuente: ...] de la última línea.
    let respuesta = salida;
    let fuente: string | null = null;
    const mFuente = respuesta.match(/\n?\s*\[fuente:\s*([^\]]+)\]\s*$/i);
    if (mFuente && typeof mFuente.index === "number") {
      fuente = mFuente[1].trim();
      respuesta = respuesta.slice(0, mFuente.index).trim();
    }
    const tuvoRespuesta = !(fuente && /sin dato/i.test(fuente));

    // 8. Registrar la consulta (analítica de huecos + voto).
    let feedbackId: string | null = null;
    try {
      const fb = await prisma.asistenteFeedback.create({
        data: {
          pregunta: texto.slice(0, 4000),
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

    // 9. Guardar el mensaje del bot + tocar la conversación.
    const botMsg = await prisma.asistenteMensaje.create({
      data: { conversacionId: conv.id, rol: "assistant", contenido: respuesta, fuente, feedbackId },
      select: { id: true, rol: true, contenido: true, fuente: true, feedbackId: true, createdAt: true },
    });
    await prisma.asistenteConversacion.update({ where: { id: conv.id }, data: { updatedAt: new Date() } }).catch(() => {});

    return NextResponse.json({
      conversacionId: conv.id,
      titulo: conv.titulo,
      userMensaje: { ...userMsg, replyTo },
      mensaje: { ...botMsg, voto: 0 },
    });
  } catch (e) {
    const msg = (e as Error).message || "Error del asistente";
    console.error("[asistente] error:", msg);
    // El mensaje del usuario ya quedó guardado; devolvemos error para reintentar.
    const publico = msg.includes("ANTHROPIC_API_KEY")
      ? "Falta configurar la API key del asistente en el servidor"
      : "El asistente no pudo responder. Probá de nuevo en unos segundos.";
    return NextResponse.json({ error: publico, conversacionId: conv.id, userMensaje: { ...userMsg, replyTo } }, { status: 502 });
  }
}

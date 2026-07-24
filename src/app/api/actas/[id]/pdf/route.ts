import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import {
  ONLYOFFICE_ENABLED, PUBLIC_BASE,
  signOnlyOffice, fileExt, esConvertibleAPdf, convertirDocumento,
} from "@/lib/onlyoffice";

// Convierte un acta de Word (docx/doc/odt) a PDF usando OnlyOffice y la descarga.
// Mismo control de acceso que la descarga normal (IDOR para técnicos).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const acta = await prisma.acta.findUnique({ where: { id } });
  if (!acta) return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });

  // IDOR: técnicos solo pueden acceder a actas de predios asignados/creados.
  if (!isModOrAdmin(session.rol) && acta.predioId) {
    const asignacion = await prisma.asignacion.findFirst({
      where: { predioId: acta.predioId, userId: session.userId },
    });
    const predio = await prisma.predio.findUnique({
      where: { id: acta.predioId },
      select: { creadorId: true },
    });
    if (!asignacion && predio?.creadorId !== session.userId) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
  }

  if (!esConvertibleAPdf(acta.archivoNombre)) {
    return NextResponse.json({ error: "Este archivo no se puede convertir a PDF" }, { status: 400 });
  }
  if (!ONLYOFFICE_ENABLED || !PUBLIC_BASE) {
    return NextResponse.json({ error: "El conversor de documentos no está configurado" }, { status: 503 });
  }

  try {
    const ext = fileExt(acta.archivoNombre) || "docx";
    const fileToken = await signOnlyOffice({ actaId: id, act: "download" }, "10m");
    const sourceUrl = `${PUBLIC_BASE}/api/actas/${id}/onlyoffice/file?t=${encodeURIComponent(fileToken)}`;
    // La key debe cambiar si cambia el documento (usa updatedAt); si no, cachea.
    const convKey = `pdf-${acta.id}-${new Date(acta.updatedAt).getTime()}`;

    const pdfUrl = await convertirDocumento({
      url: sourceUrl,
      filetype: ext,
      outputtype: "pdf",
      key: convKey,
      title: acta.archivoNombre,
    });

    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) throw new Error(`No se pudo descargar el PDF convertido (${pdfRes.status})`);
    const buf = Buffer.from(await pdfRes.arrayBuffer());

    const nombrePdf = (acta.archivoNombre || "acta").replace(/\.(docx?|odt|rtf|txt)$/i, "") + ".pdf";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nombrePdf)}"`,
        "Content-Length": String(buf.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const msg = (e as Error).message || "No se pudo generar el PDF";
    console.error("[actas pdf] conversión falló:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

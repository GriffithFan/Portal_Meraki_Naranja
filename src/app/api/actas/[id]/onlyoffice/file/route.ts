import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOnlyOffice } from "@/lib/onlyoffice";
import { readFile } from "fs/promises";
import path from "path";

// Sirve el .docx del acta al servidor OnlyOffice. No usa sesión: se valida con
// el token firmado (?t=) que emitió /onlyoffice/config. OnlyOffice lo descarga
// server-to-server, así que no puede mandar la cookie de sesión.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t") || "";
  try {
    const payload = await verifyOnlyOffice<{ actaId?: string; act?: string }>(token);
    if (payload.act !== "download" || payload.actaId !== id) {
      return NextResponse.json({ error: "Token inválido" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token inválido o vencido" }, { status: 403 });
  }

  const acta = await prisma.acta.findUnique({ where: { id } });
  if (!acta) return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), acta.archivoRuta.replace(/^\/+/, ""));
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    }
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": acta.archivoTipo || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOnlyOffice } from "@/lib/onlyoffice";
import { writeFile } from "fs/promises";
import path from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Callback de guardado de OnlyOffice. Cuando el documento se guarda (todos
// cerraron: status 2, o forcesave: status 6) OnlyOffice manda la URL del archivo
// editado; lo descargamos y sobrescribimos el archivo del acta, subiendo versión.
// Se autentica por JWT (Authorization: Bearer ... o body.token).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 1 });
  }

  try {
    const auth = request.headers.get("authorization") || "";
    const headerToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const token = headerToken || body?.token;
    if (!token) return NextResponse.json({ error: 1 });
    const verified = await verifyOnlyOffice<any>(token);
    // El payload firmado es el cuerpo del callback (algunas versiones lo anidan en .payload).
    if (verified && typeof verified === "object") {
      body = verified.payload && typeof verified.payload === "object" ? verified.payload : (verified.status !== undefined ? verified : body);
    }
  } catch {
    return NextResponse.json({ error: 1 });
  }

  const status = body?.status;

  // 2 = listo para guardar (todos cerraron) · 6 = forcesave (guardado forzado)
  if (status === 2 || status === 6) {
    const acta = await prisma.acta.findUnique({ where: { id } });
    if (!acta) return NextResponse.json({ error: 0 });
    if (body?.url) {
      try {
        const res = await fetch(body.url);
        if (!res.ok) throw new Error(`descarga falló (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        const uploadsDir = path.resolve(process.cwd(), "uploads");
        const filePath = path.resolve(process.cwd(), acta.archivoRuta.replace(/^\/+/, ""));
        if (!filePath.startsWith(uploadsDir)) throw new Error("ruta no permitida");
        await writeFile(filePath, buf);
        const actualizada = await prisma.acta.update({
          where: { id },
          data: { archivoSize: buf.length, version: { increment: 1 }, updatedAt: new Date() },
          select: { version: true },
        });
        // Registrar quién editó (OnlyOffice manda los ids en body.users).
        const editorId = Array.isArray(body?.users) ? body.users.find((u: string) => u && !String(u).startsWith("uid-")) : null;
        await prisma.actividad.create({
          data: {
            accion: "EDITAR",
            descripcion: `Acta "${acta.nombre}" editada (v${actualizada.version})`,
            entidad: "ACTA",
            entidadId: id,
            userId: editorId || acta.subidoPorId,
          },
        }).catch(() => {});
      } catch (e) {
        console.error("[onlyoffice callback] guardar falló:", (e as Error).message);
        return NextResponse.json({ error: 1 });
      }
    }
  }

  // OnlyOffice espera { error: 0 } para dar por procesado el callback.
  return NextResponse.json({ error: 0 });
}

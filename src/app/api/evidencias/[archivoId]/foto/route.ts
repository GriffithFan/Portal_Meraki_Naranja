import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { autorizarArchivoChat, resolverFotoEvidencia } from "@/lib/evidenciasCache";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic",
};

// Sirve una foto de la cache del paquete (mismo control de acceso que la estructura).
export async function GET(request: NextRequest, { params }: { params: Promise<{ archivoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { archivoId } = await params;
  const info = await autorizarArchivoChat(archivoId, session);
  if (info.error) return info.error;

  const rel = request.nextUrl.searchParams.get("e") || "";
  const filePath = resolverFotoEvidencia(archivoId, rel);
  if (!filePath) return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });

  try {
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { analizarPaquete } from "@/lib/evidencias";
import { autorizarArchivoChat, asegurarCacheEvidencias } from "@/lib/evidenciasCache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Devuelve la estructura del paquete de evidencias (envíos → puntos → fotos),
// descomprimiendo el ZIP del chat a la cache si hace falta.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ archivoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { archivoId } = await params;
  const info = await autorizarArchivoChat(archivoId, session);
  if (info.error) return info.error;

  try {
    const cacheDir = await asegurarCacheEvidencias(archivoId, info.zipPath);
    const envios = await analizarPaquete(cacheDir);
    return NextResponse.json({ nombre: info.nombre, envios }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    console.error("[evidencias] error:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message || "No se pudo abrir el paquete" }, { status: 500 });
  }
}

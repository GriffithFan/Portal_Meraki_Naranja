import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join, resolve, sep } from "path";
import { Readable } from "stream";

const BACKUP_DIR = resolve(join(process.cwd(), "backups"));
const NAME_RE = /^[A-Za-z0-9._-]+\.(sql\.gz|tar\.gz)$/;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const name = new URL(request.url).searchParams.get("name") || "";
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 });
  }

  // Defensa anti path-traversal: la ruta resuelta debe quedar dentro de BACKUP_DIR.
  // (El regex ya excluye separadores, así que `name` no puede salir del directorio.)
  const filePath = resolve(BACKUP_DIR, name);
  if (!filePath.startsWith(BACKUP_DIR + sep)) {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }

  let size = 0;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("no es un archivo");
    size = info.size;
  } catch {
    return NextResponse.json({ error: "Backup no encontrado" }, { status: 404 });
  }

  prisma.actividad.create({
    data: {
      accion: "CREAR", entidad: "BACKUP", entidadId: name,
      descripcion: `Descarga de backup "${name}" por ${session.nombre}`,
      userId: session.userId, metadata: { name, size, accion: "descarga" },
    },
  }).catch(() => {});

  const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
    },
  });
}

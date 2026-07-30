import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { generarActaPredio } from "@/lib/actas/generarActaPredio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Genera un acta a partir del número de predio (solo ADMIN). Resuelve el id de
 * Salesforce, extrae los campos, llena el template Word en el VPS y guarda el
 * resultado como un registro `Acta` (aparece en la sección, editable/descargable).
 * La incidencia se toma automáticamente del predio en Carrot.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores pueden generar actas" }, { status: 403 });
  }

  let body: { predio?: string; overwrite?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const predioNum = String(body?.predio || "").replace(/\D/g, "");
  const overwrite = body?.overwrite === true;
  if (!predioNum) {
    return NextResponse.json({ error: "Ingresá un número de predio válido" }, { status: 400 });
  }

  // Datos del predio en Carrot (para la incidencia + asociar el acta).
  const predio = await prisma.predio.findUnique({
    where: { codigo: predioNum },
    select: { id: true, nombre: true, incidencias: true },
  });
  const incidencia = (predio?.incidencias || "").trim();

  // El nombre del acta es el número de predio (misma convención que el upload).
  const nombre = predioNum;
  const existing = await prisma.acta.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" } },
    select: { id: true, nombre: true, archivoNombre: true, archivoRuta: true, archivoSize: true, createdAt: true, version: true },
  });
  if (existing && !overwrite) {
    return NextResponse.json(
      { error: "Ya existe un acta con ese número de predio", duplicado: existing },
      { status: 409 }
    );
  }

  // Correr el generador (Selenium + Chrome + python-docx en el VPS).
  const r = await generarActaPredio(predioNum, incidencia);
  if (!r.ok || !r.docx) {
    return NextResponse.json({ error: r.error || "No se pudo generar el acta" }, { status: 422 });
  }

  // Leer el .docx generado y guardarlo en uploads/actas (como cualquier acta).
  let buffer: Buffer;
  try {
    buffer = await readFile(r.docx);
  } catch {
    return NextResponse.json({ error: "El acta se generó pero no se pudo leer el archivo" }, { status: 500 });
  }
  // Limpieza best-effort del temporal.
  unlink(r.docx).catch(() => {});

  const uploadsDir = path.join(process.cwd(), "uploads", "actas");
  await mkdir(uploadsDir, { recursive: true });
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.docx`;
  await writeFile(path.join(uploadsDir, safeName), buffer);

  const archivoNombre = r.nombreArchivo || `Acta_${predioNum}.docx`;
  const descripcion = [
    "Generada automáticamente desde Salesforce",
    r.establecimiento ? `· ${r.establecimiento}` : "",
    incidencia ? `· ${incidencia}` : "",
  ].filter(Boolean).join(" ");

  let acta;
  if (existing && overwrite) {
    // Borrar el archivo anterior (dentro de uploads) best-effort.
    try {
      const oldPath = path.resolve(path.join(process.cwd(), existing.archivoRuta));
      if (oldPath.startsWith(path.join(process.cwd(), "uploads"))) {
        await unlink(oldPath).catch(() => {});
      }
    } catch { /* ignorar */ }

    acta = await prisma.acta.update({
      where: { id: existing.id },
      data: {
        nombre,
        descripcion,
        archivoNombre,
        archivoTipo: DOCX_MIME,
        archivoRuta: `/uploads/actas/${safeName}`,
        archivoSize: buffer.length,
        predioId: predio?.id || null,
        subidoPorId: session.userId,
        version: { increment: 1 },
      },
    });
    await prisma.actividad.create({
      data: {
        accion: "EDITAR",
        descripcion: `Acta "${nombre}" regenerada desde Salesforce`,
        entidad: "ACTA",
        entidadId: acta.id,
        userId: session.userId,
      },
    }).catch(() => {});
  } else {
    acta = await prisma.acta.create({
      data: {
        nombre,
        descripcion,
        archivoNombre,
        archivoTipo: DOCX_MIME,
        archivoRuta: `/uploads/actas/${safeName}`,
        archivoSize: buffer.length,
        predioId: predio?.id || null,
        subidoPorId: session.userId,
      },
    });
    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Acta "${nombre}" generada desde Salesforce`,
        entidad: "ACTA",
        entidadId: acta.id,
        userId: session.userId,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ acta, meta: { establecimiento: r.establecimiento, cue: r.cue, incidencia, predioEnCarrot: !!predio } }, { status: 201 });
}

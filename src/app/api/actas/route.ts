import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sanitizeSearch } from "@/lib/sanitize";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const predioId = searchParams.get("predioId");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};
  if (predioId) where.predioId = predioId;
  if (buscar) {
    where.OR = [
      { nombre: { contains: buscar, mode: "insensitive" } },
      { descripcion: { contains: buscar, mode: "insensitive" } },
      { archivoNombre: { contains: buscar, mode: "insensitive" } },
      { predio: { nombre: { contains: buscar, mode: "insensitive" } } },
    ];
  }

  const actas = await prisma.acta.findMany({
    where,
    include: {
      predio: { select: { id: true, nombre: true } },
      subidoPor: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ actas });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const nombre = formData.get("nombre") as string;
    const descripcion = formData.get("descripcion") as string | null;
    const predioId = formData.get("predioId") as string | null;

    if (!file || !nombre) {
      return NextResponse.json({ error: "Archivo y nombre son requeridos" }, { status: 400 });
    }

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    const allowedExtensions = /\.(pdf|docx|doc)$/i;

    if (!allowedTypes.includes(file.type) && !file.name.match(allowedExtensions)) {
      return NextResponse.json({ error: "Solo se permiten archivos PDF y DOCX" }, { status: 400 });
    }

    // Limitar tamaño a 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo no puede superar 10MB" }, { status: 400 });
    }

    // Guardar archivo
    const uploadsDir = path.join(process.cwd(), "uploads", "actas");
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const acta = await prisma.acta.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        archivoNombre: file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200),
        archivoTipo: file.type || ext.replace(".", ""),
        archivoRuta: `/uploads/actas/${safeName}`,
        archivoSize: file.size,
        predioId: predioId || null,
        subidoPorId: session.userId,
      },
    });

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Acta "${nombre}" subida (${file.name})`,
        entidad: "ACTA",
        entidadId: acta.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(acta, { status: 201 });
  } catch (error) {
    console.error("Error subiendo acta:", error);
    return NextResponse.json({ error: "Error al subir acta" }, { status: 500 });
  }
}

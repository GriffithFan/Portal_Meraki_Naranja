import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { sanitizeSearch } from "@/lib/sanitize";
import { detectarProvincia } from "@/utils/provinciaUtils";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const predioId = searchParams.get("predioId");
  const provincia = searchParams.get("provincia");
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "100") || 100, 1), 500);
  const pageParam = searchParams.get("page");
  const page = Math.max(parseInt(pageParam || "1") || 1, 1);
  const skip = (page - 1) * limit;

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
  // Filtro por rango de fecha
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt.gte = new Date(desde);
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59, 999);
      where.createdAt.lte = h;
    }
  }

  // Si se filtra por provincia, necesitamos traer todo y filtrar en memoria
  // ya que la provincia se deriva del nombre (no es un campo en DB)
  if (provincia) {
    const allActas = await prisma.acta.findMany({
      where,
      include: {
        predio: { select: { id: true, nombre: true } },
        subidoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = allActas.filter((a) => {
      const prov = detectarProvincia(a.nombre);
      return prov && prov.toLowerCase() === provincia.toLowerCase();
    });

    const total = filtered.length;
    const paged = filtered.slice(skip, skip + limit);
    return NextResponse.json({ actas: paged, total, page, limit });
  }

  const [actas, total] = await Promise.all([
    prisma.acta.findMany({
      where,
      include: {
        predio: { select: { id: true, nombre: true } },
        subidoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.acta.count({ where }),
  ]);

  return NextResponse.json({ actas, total, page, limit });
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
    const overwrite = formData.get("overwrite") === "true";

    if (!file || !nombre) {
      return NextResponse.json({ error: "Archivo y nombre son requeridos" }, { status: 400 });
    }

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    const allowedExtensions = /\.(pdf|docx|doc)$/i;

    if (!allowedTypes.includes(file.type) || !file.name.match(allowedExtensions)) {
      return NextResponse.json({ error: "Solo se permiten archivos PDF y DOCX" }, { status: 400 });
    }

    // Limitar tamaño a 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo no puede superar 10MB" }, { status: 400 });
    }

    // Detectar duplicado por nombre
    const existing = await prisma.acta.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" } },
      select: { id: true, nombre: true, archivoNombre: true, archivoRuta: true, archivoSize: true, createdAt: true },
    });

    if (existing && !overwrite) {
      return NextResponse.json({
        error: "Ya existe un acta con ese nombre",
        duplicado: existing,
      }, { status: 409 });
    }

    // Guardar archivo
    const uploadsDir = path.join(process.cwd(), "uploads", "actas");
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    let acta;
    if (existing && overwrite) {
      // Intentar borrar archivo anterior
      try {
        const oldPath = path.join(process.cwd(), existing.archivoRuta);
        const resolved = path.resolve(oldPath);
        if (resolved.startsWith(path.join(process.cwd(), "uploads"))) {
          await unlink(resolved).catch(() => {});
        }
      } catch { /* ignorar */ }

      acta = await prisma.acta.update({
        where: { id: existing.id },
        data: {
          nombre,
          descripcion: descripcion || null,
          archivoNombre: file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200),
          archivoTipo: file.type || ext.replace(".", ""),
          archivoRuta: `/uploads/actas/${safeName}`,
          archivoSize: file.size,
          predioId: predioId || null,
          subidoPorId: session.userId,
          version: { increment: 1 },
        },
      });

      await prisma.actividad.create({
        data: {
          accion: "EDITAR",
          descripcion: `Acta "${nombre}" sobreescrita (${file.name})`,
          entidad: "ACTA",
          entidadId: acta.id,
          userId: session.userId,
        },
      });
    } else {
      acta = await prisma.acta.create({
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
    }

    return NextResponse.json(acta, { status: 201 });
  } catch (error) {
    console.error("Error subiendo acta:", error);
    return NextResponse.json({ error: "Error al subir acta" }, { status: 500 });
  }
}

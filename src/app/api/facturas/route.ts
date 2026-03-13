import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sanitizeSearch } from "@/lib/sanitize";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const estado = searchParams.get("estado");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};

  if (estado) where.estado = estado;
  if (buscar) {
    where.OR = [
      { concepto: { contains: buscar, mode: "insensitive" } },
      { numero: { contains: buscar, mode: "insensitive" } },
      { notas: { contains: buscar, mode: "insensitive" } },
      { archivoNombre: { contains: buscar, mode: "insensitive" } },
    ];
  }

  const facturas = await prisma.factura.findMany({
    where,
    include: {
      subidoPor: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ facturas });
}

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const ALLOWED_EXT = /\.(pdf|jpg|jpeg|png|webp|xlsx|xls)$/i;
const MAX_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const concepto = formData.get("concepto") as string;
    const numero = formData.get("numero") as string | null;
    const monto = formData.get("monto") as string | null;
    const moneda = formData.get("moneda") as string | null;
    const fechaEmision = formData.get("fechaEmision") as string | null;
    const notas = formData.get("notas") as string | null;

    if (!file || !concepto) {
      return NextResponse.json({ error: "Archivo y concepto son requeridos" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(ALLOWED_EXT)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido. Use PDF, imagen o Excel." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "El archivo no puede superar 15MB" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "facturas");
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const factura = await prisma.factura.create({
      data: {
        concepto,
        numero: numero || null,
        monto: monto ? parseFloat(monto) : null,
        moneda: moneda || "ARS",
        fechaEmision: fechaEmision ? new Date(fechaEmision) : null,
        notas: notas || null,
        archivoNombre: file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200),
        archivoTipo: file.type || ext.replace(".", ""),
        archivoRuta: `/uploads/facturas/${safeName}`,
        archivoSize: file.size,
        subidoPorId: session.userId,
      },
      include: {
        subidoPor: { select: { id: true, nombre: true } },
      },
    });

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Factura "${concepto}" subida (${file.name})`,
        entidad: "FACTURA",
        entidadId: factura.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(factura, { status: 201 });
  } catch (error) {
    console.error("Error subiendo factura:", error);
    return NextResponse.json({ error: "Error al subir factura" }, { status: 500 });
  }
}

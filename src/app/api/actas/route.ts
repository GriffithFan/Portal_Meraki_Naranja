import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { sanitizeSearch } from "@/lib/sanitize";
import { sanitizeFileName, validateAndReadUpload } from "@/lib/uploadSecurity";
import {
  construirWhereActas,
  ESTADOS_CHIP,
  filtrosDesdeParams,
  listaTecnicos,
  resolverPredioPorNombre,
  SELECT_LISTA,
  type FiltrosActas,
} from "@/lib/actasFiltros";

const ACTA_ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const ACTA_ALLOWED_EXTENSIONS = ["pdf", "docx", "doc"];
const ACTA_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Lista de actas, paginada y filtrada en la base.
 *
 * Antes el filtro por provincia traía la tabla entera a memoria del servidor para
 * descartar filas en Node, y la pantalla pedía 500 actas de entrada (3000 al buscar)
 * para mostrar 60. Ahora todo se resuelve con `where` + `take`, y la provincia sale
 * de la columna del predio en vez de deducirse del nombre del archivo.
 *
 * `contar=1` agrega los totales por estado para los chips, en un `groupBy` aparte:
 * contar sobre las filas ya traídas daría mal apenas hay paginación.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "60") || 60, 1), 500);
  const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
  const skip = (page - 1) * limit;

  const filtros = filtrosDesdeParams(searchParams, buscar);
  const where = await construirWhereActas(filtros);

  const [actas, total] = await Promise.all([
    prisma.acta.findMany({
      where,
      select: SELECT_LISTA,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.acta.count({ where }),
  ]);

  const respuesta: Record<string, unknown> = { actas, total, page, limit };

  // Solo en la primera carga: los chips y el desplegable de técnicos no cambian al
  // pasar de página, así que no tiene sentido recalcularlos en cada scroll.
  if (searchParams.get("contar") === "1") {
    const [conteos, tecnicos] = await Promise.all([
      contarPorEstado(filtros, ESTADOS_CHIP),
      listaTecnicos(),
    ]);
    respuesta.conteos = conteos;
    respuesta.tecnicos = tecnicos;
    respuesta.estadosChip = ESTADOS_CHIP;
  }

  return NextResponse.json(respuesta);
}

/**
 * Cuántas actas hay en cada estado que la pantalla muestra como chip.
 *
 * Se cuenta estado por estado en vez de agrupar: agrupar obligaría a traer una fila
 * por acta para contarlas en Node, que es exactamente lo que se quiere evitar. Son
 * tres `count()` que van por índice y corren en paralelo.
 *
 * El filtro de estado se ignora a propósito: si contara con el estado aplicado, cada
 * chip mostraría su propio total y los demás en cero.
 */
async function contarPorEstado(filtros: FiltrosActas, estados: string[]) {
  const base = await construirWhereActas({ ...filtros, estados: [], soloHuerfanas: false });

  const [porEstado, sinPredio, total] = await Promise.all([
    Promise.all(estados.map((nombre) =>
      prisma.acta.count({ where: { ...base, predio: { ...(base.predio || {}), estado: { nombre } } } })
    )),
    prisma.acta.count({ where: { ...base, predio: undefined, predioId: null } }),
    prisma.acta.count({ where: base }),
  ]);

  return {
    estados: Object.fromEntries(estados.map((n, i) => [n, porEstado[i]])),
    sinPredio,
    total,
  };
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
    const predioIdForm = formData.get("predioId") as string | null;
    const overwrite = formData.get("overwrite") === "true";

    if (!file || !nombre) {
      return NextResponse.json({ error: "Archivo y nombre son requeridos" }, { status: 400 });
    }

    const validation = await validateAndReadUpload({
      file,
      allowedMimeTypes: ACTA_ALLOWED_TYPES,
      allowedExtensions: ACTA_ALLOWED_EXTENSIONS,
      maxSizeBytes: ACTA_MAX_FILE_SIZE,
      label: "acta",
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    // Si no vino el predio en el formulario, se deduce del nombre. Sin esto cada acta
    // subida a mano nace sin enlace y deja de aparecer en los filtros por técnico y
    // por estado, que es como se quedaron las 2300 que hubo que enlazar después.
    const predioId = predioIdForm || (await resolverPredioPorNombre(nombre));

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

    const ext = `.${validation.extension}`;
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    await writeFile(filePath, validation.buffer);

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
          archivoNombre: sanitizeFileName(file.name),
          archivoTipo: validation.mime,
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
          archivoNombre: sanitizeFileName(file.name),
          archivoTipo: validation.mime,
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

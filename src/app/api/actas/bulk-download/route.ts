import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import archiver from "archiver";
import { construirWhereActas, filtrosDesdeParams } from "@/lib/actasFiltros";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Tope por descarga: 500 actas son ~53 MB, que ya es una espera larga. */
const MAX_ACTAS = 500;

/**
 * Descarga varias actas en un ZIP.
 *
 * Acepta dos formas de decir qué bajar:
 *   { ids: [...] }        las tildadas en pantalla
 *   { filtros: {...} }    todo lo que matchea el filtro actual, sin tildar nada
 *
 * La segunda es la que evita marcar 200 casillas para bajar todo lo de un técnico, y
 * usa el mismo `where` que la lista: lo que se ve es lo que se baja.
 *
 * El ZIP se arma en streaming: cada archivo se lee del disco y se escribe a la
 * respuesta a medida que avanza, sin juntar nada en memoria. Bajar 500 actas cuesta
 * lo mismo en RAM que bajar una.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { ids?: string[]; filtros?: Record<string, string>; etiqueta?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string" && x) : [];
  if (!ids.length && !body.filtros) {
    return NextResponse.json({ error: "Elegí actas o aplicá un filtro" }, { status: 400 });
  }

  // Los filtros se leen con el mismo parser que usa la lista. Si el ZIP interpretara
  // los parámetros por su cuenta, podría traer algo distinto de lo que se ve en
  // pantalla y el filtro dejaría de ser confiable.
  const where = ids.length
    ? { id: { in: ids.slice(0, MAX_ACTAS) } }
    : await construirWhereActas(filtrosDesdeParams(new URLSearchParams(body.filtros), body.filtros!.buscar || null));

  const total = await prisma.acta.count({ where });
  if (total === 0) {
    return NextResponse.json({ error: "No hay actas para descargar con ese filtro" }, { status: 404 });
  }
  if (total > MAX_ACTAS) {
    return NextResponse.json(
      { error: `Son ${total} actas y el máximo por descarga es ${MAX_ACTAS}. Afiná el filtro (por técnico, estado o fecha) y volvé a intentar.` },
      { status: 413 }
    );
  }

  const actas = await prisma.acta.findMany({
    where,
    select: {
      nombre: true, archivoNombre: true, archivoRuta: true, createdAt: true,
      predio: {
        select: {
          codigo: true, nombre: true, provincia: true,
          estado: { select: { nombre: true } },
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            orderBy: { createdAt: "asc" },
            select: { usuario: { select: { nombre: true } } },
          },
        },
      },
    },
    orderBy: { nombre: "asc" },
    take: MAX_ACTAS,
  });

  const uploads = path.resolve(process.cwd(), "uploads");
  // Nivel 1: un .docx y un .pdf ya vienen comprimidos por dentro, así que apretarlos
  // de nuevo quema CPU del servidor para ganar un par de por ciento.
  const zip = archiver("zip", { zlib: { level: 1 } });

  const filas: string[] = ["acta;archivo;predio;establecimiento;estado;tecnico;provincia;subida"];
  const usados = new Set<string>();
  let incluidas = 0;

  for (const a of actas) {
    const ruta = path.resolve(process.cwd(), a.archivoRuta);
    if (!ruta.startsWith(uploads)) continue;
    try {
      await stat(ruta);
    } catch {
      continue; // el registro existe pero el archivo no está: se omite y se avisa en el listado
    }

    // Dos actas pueden compartir nombre de archivo; el ZIP quedaría con una sola.
    let nombreEnZip = a.archivoNombre || `${a.nombre}.docx`;
    if (usados.has(nombreEnZip)) {
      const ext = path.extname(nombreEnZip);
      nombreEnZip = `${path.basename(nombreEnZip, ext)}-${a.nombre}${ext}`;
    }
    usados.add(nombreEnZip);

    zip.append(createReadStream(ruta), { name: nombreEnZip });
    incluidas += 1;

    const asignados = (a.predio?.asignaciones || []).filter((x) => x.usuario);
    const tecnico = asignados.length ? asignados[asignados.length - 1].usuario!.nombre : "";
    filas.push([
      a.nombre, nombreEnZip, a.predio?.codigo || "", a.predio?.nombre || "",
      a.predio?.estado?.nombre || "", tecnico || "", a.predio?.provincia || "",
      new Date(a.createdAt).toLocaleDateString("es-AR"),
    ].map((v) => String(v).replace(/;/g, ",")).join(";"));
  }

  // Saber qué se bajó sin abrir carpeta por carpeta.
  zip.append("﻿" + filas.join("\n") + "\n", { name: "listado.csv" });
  zip.finalize();

  const etiqueta = (body.etiqueta || "actas")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "actas";
  const fecha = new Date().toISOString().slice(0, 10);

  // archiver es un stream de Node; la respuesta necesita uno web.
  const cuerpo = Readable.toWeb(zip) as unknown as ReadableStream;

  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${etiqueta}-${fecha}.zip"`,
      "X-Actas-Incluidas": String(incluidas),
      "Cache-Control": "no-store",
    },
  });
}

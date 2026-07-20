import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { resolverPrediosAlcance, type AlcanceSpec } from "@/lib/enriquecimiento/alcance";
import { filasEntradaDesdePredios } from "@/lib/enriquecimiento/persistir";

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/enriquecimiento/generar-entrada — crea el job y devuelve el Excel de
// entrada (Predio + Incidencia + columnas Origen_* de contexto). Solo ADMIN.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let alcance: AlcanceSpec;
  try {
    alcance = (await request.json()) as AlcanceSpec;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const predios = await resolverPrediosAlcance(alcance);
  // Solo los que tienen incidencia son enriquecibles por este flujo.
  const conPar = predios.filter((p) => p.codigo && p.incidencia);
  if (conPar.length === 0) {
    return NextResponse.json({ error: "El alcance no tiene predios con incidencia para enriquecer" }, { status: 400 });
  }

  const paresSnapshot = conPar.map((p) => ({ predioId: p.id, codigo: p.codigo, incidencia: p.incidencia }));
  const fecha = new Date().toISOString().slice(0, 10);
  const archivoEntrada = `Entrada_Enriquecimiento_${fecha}.xlsx`;

  const job = await prisma.enriquecimientoJob.create({
    data: {
      estado: "ESPERANDO_ARCHIVO",
      alcance: alcance as any,
      paresSnapshot: paresSnapshot as any,
      archivoEntrada,
      creadoPorId: session.userId,
    },
  });

  const rows = filasEntradaDesdePredios(conPar);

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Entrada");
  const buffer = new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(archivoEntrada)}"`,
      "Content-Length": String(buffer.length),
      "X-Content-Type-Options": "nosniff",
      "X-Job-Id": job.id,
      "X-Pares": String(paresSnapshot.length),
    },
  });
}

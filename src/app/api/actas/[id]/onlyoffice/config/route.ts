import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import {
  ONLYOFFICE_ENABLED, ONLYOFFICE_URL, PUBLIC_BASE,
  signOnlyOffice, fileExt, documentType, esEditableOnlyOffice,
} from "@/lib/onlyoffice";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Devuelve el config firmado para embeber el editor OnlyOffice de un acta.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos para editar actas" }, { status: 403 });
  }
  if (!ONLYOFFICE_ENABLED || !PUBLIC_BASE) {
    return NextResponse.json({ error: "El editor de documentos no está configurado" }, { status: 503 });
  }

  const { id } = await params;
  const acta = await prisma.acta.findUnique({ where: { id } });
  if (!acta) return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });
  if (!esEditableOnlyOffice(acta.archivoNombre)) {
    return NextResponse.json({ error: "Este archivo no es editable" }, { status: 400 });
  }

  const ext = fileExt(acta.archivoNombre) || "docx";
  // La "key" debe cambiar cada vez que cambia el documento (si no, OnlyOffice
  // sirve la versión cacheada). updatedAt cambia al guardar desde el callback.
  const docKey = `acta-${acta.id}-${new Date(acta.updatedAt).getTime()}`;
  const fileToken = await signOnlyOffice({ actaId: id, act: "download" }, "3h");

  const config: any = {
    document: {
      fileType: ext,
      key: docKey,
      title: acta.archivoNombre,
      url: `${PUBLIC_BASE}/api/actas/${id}/onlyoffice/file?t=${encodeURIComponent(fileToken)}`,
      permissions: { edit: true, download: true, print: true },
    },
    documentType: documentType(ext),
    editorConfig: {
      mode: "edit",
      lang: "es-ES",
      callbackUrl: `${PUBLIC_BASE}/api/actas/${id}/onlyoffice/callback`,
      user: { id: session.userId, name: session.nombre || "Usuario" },
      customization: {
        forcesave: true,
        autosave: true,
        compactHeader: false,
        uiTheme: "theme-classic-light",
      },
    },
  };
  config.token = await signOnlyOffice(config, "3h");

  return NextResponse.json({
    config,
    ooUrl: ONLYOFFICE_URL,
    nombre: acta.archivoNombre,
  });
}

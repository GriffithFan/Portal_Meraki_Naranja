import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createDeviceLiveToolsCableTest, getDeviceLiveToolsCableTest } from "@/lib/meraki";

/* POST — Launch cable test */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { serial } = await params;
  if (!/^[A-Z0-9-]+$/i.test(serial)) {
    return NextResponse.json({ error: "Serial inválido" }, { status: 400 });
  }

  let body: { ports: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.ports) || body.ports.length === 0 || body.ports.length > 28) {
    return NextResponse.json({ error: "Especifique entre 1 y 28 puertos" }, { status: 400 });
  }

  // Validate each port is a simple number string
  for (const p of body.ports) {
    if (!/^\d+$/.test(p)) {
      return NextResponse.json({ error: `Puerto inválido: ${p}` }, { status: 400 });
    }
  }

  try {
    const result = await createDeviceLiveToolsCableTest(serial, body.ports);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al iniciar cable test";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/* GET — Poll cable test status */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { serial } = await params;
  if (!/^[A-Z0-9-]+$/i.test(serial)) {
    return NextResponse.json({ error: "Serial inválido" }, { status: 400 });
  }

  const cableTestId = request.nextUrl.searchParams.get("id");
  if (!cableTestId) {
    return NextResponse.json({ error: "Falta parámetro id" }, { status: 400 });
  }

  try {
    const result = await getDeviceLiveToolsCableTest(serial, cableTestId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar cable test";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

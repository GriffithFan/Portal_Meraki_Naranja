import { NextResponse } from "next/server";
import { removeTokenCookie, getSession } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  await removeTokenCookie();
  return NextResponse.json({ ok: true });
}

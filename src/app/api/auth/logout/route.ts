import { NextResponse } from "next/server";
import { removeTokenCookie } from "@/lib/auth";

export async function POST() {
  await removeTokenCookie();
  return NextResponse.json({ ok: true });
}

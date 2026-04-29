import { NextResponse } from "next/server";

export function withPrivateCatalogCache<T>(response: NextResponse<T>) {
  response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
  return response;
}
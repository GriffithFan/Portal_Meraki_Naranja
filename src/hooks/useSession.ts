"use client";
import { useSessionContext } from "@/contexts/SessionContext";

/**
 * Hook que reutiliza el SessionProvider — un solo fetch para toda la app.
 */
export function useSession() {
  return useSessionContext();
}

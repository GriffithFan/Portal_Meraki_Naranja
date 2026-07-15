"use client";

import { useSession } from "@/hooks/useSession";
import { esPersonalOnly } from "@/lib/fichasAccess";

/**
 * Oculta a sus hijos para cuentas ULTRA-RESTRINGIDAS (solo Personal): chat,
 * anuncios, buscador global, push, etc. no deben existir para esos usuarios.
 */
export default function OcultarParaPersonalOnly({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (esPersonalOnly(session?.email)) return null;
  return <>{children}</>;
}

"use client";
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";

interface Session {
  userId: string;
  email: string;
  rol: string;
  nombre: string;
  esMesa?: boolean;
}

interface SessionContextType {
  session: Session | null;
  loading: boolean;
  isModOrAdmin: boolean;
  isAdmin: boolean;
  isMesa: boolean;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => {
        // Sesión expirada/ausente dentro del panel: redirigir a login en vez de
        // dejar la app en estado inválido (el técnico veía "No autorizado" al
        // intentar usar el chat sin forma de recuperarse).
        if (r.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard")) {
          window.location.href = "/login";
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data?.user) {
          setSession(data.user);
        } else if (data?.userId) {
          setSession(data);
        } else {
          setSession(null);
        }
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => {
    const isModOrAdmin = session?.rol === "ADMIN" || session?.rol === "MODERADOR";
    const isAdmin = session?.rol === "ADMIN";
    const isMesa = session?.esMesa === true;
    return { session, loading, isModOrAdmin, isAdmin, isMesa };
  }, [session, loading]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
}

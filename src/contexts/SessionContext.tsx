"use client";
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";

interface Session {
  userId: string;
  email: string;
  rol: string;
  nombre: string;
}

interface SessionContextType {
  session: Session | null;
  loading: boolean;
  isModOrAdmin: boolean;
  isAdmin: boolean;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
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
    return { session, loading, isModOrAdmin, isAdmin };
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

"use client";
import { useState, useEffect } from "react";

interface Session {
  userId: string;
  email: string;
  rol: string;
  nombre: string;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // La API devuelve { user: {...} }, extraemos el user
        if (data?.user) {
          setSession(data.user);
        } else if (data?.userId) {
          // Por si la API devuelve directamente los datos
          setSession(data);
        } else {
          setSession(null);
        }
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const isModOrAdmin = session?.rol === "ADMIN" || session?.rol === "MODERADOR";
  const isAdmin = session?.rol === "ADMIN";

  return { session, loading, isModOrAdmin, isAdmin };
}

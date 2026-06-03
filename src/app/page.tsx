"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace("/login");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-50 px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-surface-700">Abriendo Carrot...</p>
        <a className="mt-3 inline-flex text-xs font-medium text-primary-600 hover:text-primary-700" href="/login">
          Ir al inicio de sesión
        </a>
      </div>
    </main>
  );
}

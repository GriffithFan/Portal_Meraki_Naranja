"use client";

import { useState } from "react";

export default function PrediosPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-xl font-semibold text-surface-800 mb-1">Predios</h1>
      <p className="text-xs text-surface-400 mb-6">Gestión y consulta de predios</p>

      <div className="bg-white rounded-lg border border-surface-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número de predio..."
            className="flex-1 px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
          />
          <button className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors">
            Buscar
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-surface-400">
          <svg className="w-16 h-16 mb-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M5.25 3h13.5M5.25 3v4.5m0 0h13.5M5.25 7.5v4.5m0 0h13.5M5.25 12v4.5m0 0h13.5" />
          </svg>
          <p className="text-sm font-medium text-surface-500 mb-2">Módulo de Predios</p>
          <p className="text-xs mb-4">Próximamente se gestionarán los predios con datos de la API Meraki.</p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-600 rounded-full text-xs font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21" /></svg>
            En desarrollo
          </span>
        </div>
      </div>
    </div>
  );
}

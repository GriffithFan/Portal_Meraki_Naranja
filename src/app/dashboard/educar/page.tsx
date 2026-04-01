"use client";

import { useState } from "react";
import { useSession } from "@/hooks/useSession";

const PROXY_URL = "/api/educar/proxy/forms/pnce";

export default function EducARPage() {
  const { session } = useSession();
  const [showConfirm, setShowConfirm] = useState(false);

  const isModOrAdmin = session?.rol === "ADMIN" || session?.rol === "MODERADOR";

  if (!isModOrAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-surface-500">No tienes permisos para acceder a esta sección.</p>
      </div>
    );
  }

  const handleLaunch = () => {
    setShowConfirm(false);
    window.open(PROXY_URL, "_blank");
  };

  return (
    <div className="max-w-2xl mx-auto mt-12 px-4">
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
            <h1 className="text-2xl font-bold">EducAR — PNCE Salesforce</h1>
          </div>
          <p className="text-sky-100 text-sm">
            Acceso a la plataforma Salesforce PNCE con bypass PWA integrado
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <div className="flex gap-2">
              <svg className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <div>
                <p className="text-sky-800 font-medium text-sm">¿Cómo funciona?</p>
                <p className="text-sky-700 text-xs mt-1">
                  El portal actúa como intermediario con el sitio de Salesforce, 
                  emulando un dispositivo móvil y modificando el código JavaScript 
                  para desactivar las verificaciones de entorno (<code className="bg-sky-100 px-1 rounded">debugMode=true</code>).
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-surface-700 text-sm">El bypass automáticamente:</h3>
            <ul className="text-sm text-surface-600 space-y-1.5 ml-4">
              <li className="flex gap-2">
                <span className="text-emerald-500">✓</span>
                Emula un dispositivo Android (tablet SM-X710)
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">✓</span>
                Activa <code className="text-xs bg-surface-100 px-1 rounded">debugMode</code> en pnce_SPA.js 
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">✓</span>
                Bloquea el detector de DevTools
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">✓</span>
                Simula modo PWA standalone
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Iniciar EducAR
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-surface-800">Iniciar EducAR</h3>
                <p className="text-xs text-surface-500">Bypass PWA de Salesforce PNCE</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-6">
              Se va a cargar la plataforma Salesforce PNCE con el bypass activo dentro del portal. 
              El tráfico pasa por nuestro servidor para modificar las verificaciones de entorno.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 px-4 border border-surface-200 rounded-lg text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleLaunch}
                className="flex-1 py-2.5 px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Confirmar e iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

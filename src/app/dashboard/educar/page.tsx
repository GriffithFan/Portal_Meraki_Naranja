"use client";

import { useState } from "react";
import { useSession } from "@/hooks/useSession";

const EDUCAR_URL = "https://d1i0000001z2ruaq.my.salesforce-sites.com/forms/pnce#";

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
    window.open(EDUCAR_URL, "_blank", "noopener,noreferrer");
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
            <h1 className="text-2xl font-bold">EducAR - PNCE Salesforce</h1>
          </div>
          <p className="text-sky-100 text-sm">
            Acceso a la plataforma Salesforce PNCE mediante bypass PWA
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex gap-2">
              <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-amber-800 font-medium text-sm">Aviso importante</p>
                <p className="text-amber-700 text-xs mt-1">
                  Esta herramienta abre el sitio de Salesforce PNCE en una nueva pestaña. 
                  El sitio requiere estar emulando un dispositivo móvil. Para uso completo 
                  con bypass automático, ejecutar el script Python localmente.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-surface-700 text-sm">¿Qué hace esta herramienta?</h3>
            <ul className="text-sm text-surface-600 space-y-1.5 ml-4">
              <li className="flex gap-2">
                <span className="text-sky-500">1.</span>
                Abre la plataforma Salesforce PNCE (formularios de educación)
              </li>
              <li className="flex gap-2">
                <span className="text-sky-500">2.</span>
                Permite acceder desde el navegador de escritorio simulando un dispositivo móvil
              </li>
              <li className="flex gap-2">
                <span className="text-sky-500">3.</span>
                El bypass completo (debugMode) requiere ejecutar el script Python local
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Abrir EducAR (Salesforce PNCE)
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-surface-800">Abrir EducAR</h3>
                <p className="text-xs text-surface-500">Se abrirá en una nueva pestaña</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-6">
              Vas a acceder al sitio de Salesforce PNCE. El sitio se abrirá en una nueva pestaña del navegador. 
              Recordá que para el bypass completo necesitás ejecutar el script Python en tu equipo local.
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
                Confirmar y abrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

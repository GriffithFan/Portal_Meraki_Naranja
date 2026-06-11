"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [requiere2FA, setRequiere2FA] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code: code.trim() || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiere2FA) {
          setRequiere2FA(true);
          // Solo mostrar error si ya habían ingresado un código (código incorrecto)
          setError(code.trim() ? (data.error || "Código de verificación inválido") : "");
        } else {
          setError(data.error || "Credenciales inválidas");
        }
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-50 text-surface-900 relative overflow-hidden">
      {/* Acento corporativo: barra superior delgada con gradiente sutil de marca */}
      <div className="h-[3px] w-full bg-gradient-to-r from-primary-700 via-primary-500 to-accent-500" />

      {/* Patrón geométrico de fondo muy sutil */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(15,35,58,0.08) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Glow corporativo apenas perceptible (sin blobs grandes) */}
      <div className="absolute -top-32 -right-32 w-[480px] h-[480px] bg-primary-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[420px] h-[420px] bg-accent-100/30 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header corporativo minimal ── */}
      <header className="relative z-10 w-full border-b border-surface-200/70 bg-white/70 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 h-12 flex items-center justify-between">
          <span className="text-[12px] uppercase tracking-[0.18em] text-surface-500 font-semibold">
            Plataforma interna
          </span>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-surface-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span className="font-medium">Servicio operativo</span>
          </div>
        </div>
      </header>

      {/* ── Contenido principal ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 py-8 sm:py-12">
        <div className="w-full max-w-[440px]">
          {/* Logo grande centrado sobre la tarjeta */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              {/* halo sutil detrás del logo */}
              <div className="absolute inset-0 bg-primary-500/10 rounded-full blur-2xl scale-110" />
              <Image
                src="/images/logo-full.png"
                alt="Carrot"
                width={200}
                height={226}
                className="relative w-[150px] sm:w-[170px] h-auto drop-shadow-[0_6px_16px_rgba(10,47,97,0.18)]"
                priority
              />
            </div>
          </div>

          {/* Encabezado */}
          <div className="mb-6 text-center">
            <h1 className="text-[24px] sm:text-[26px] font-bold text-surface-900 tracking-tight leading-tight">
              Iniciar sesión
            </h1>
            <p className="text-sm text-surface-600 mt-1.5 leading-relaxed">
              Use sus credenciales corporativas para continuar.
            </p>
          </div>

          {/* Tarjeta del formulario */}
          <div className="bg-white border border-surface-200 rounded-md shadow-[0_1px_2px_rgba(15,35,58,0.04),_0_8px_24px_-12px_rgba(15,35,58,0.12)]">
            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mx-6 mt-6 flex items-start gap-2.5 p-3 bg-red-50 border-l-2 border-red-500 text-red-800 text-[13px] animate-shake"
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-[12px] font-semibold text-surface-700 mb-1.5 uppercase tracking-wide"
                >
                  Correo electrónico
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
                    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-[14px] bg-white text-surface-900
                      border border-surface-300 rounded-md
                      focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100
                      placeholder:text-surface-400 transition-colors"
                    placeholder="nombre@empresa.com"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-[12px] font-semibold text-surface-700 mb-1.5 uppercase tracking-wide"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
                    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-[14px] bg-white text-surface-900
                      border border-surface-300 rounded-md
                      focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100
                      placeholder:text-surface-400 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Código 2FA (solo si el usuario lo tiene activo) */}
              {requiere2FA && (
                <div>
                  <label
                    htmlFor="code"
                    className="block text-[12px] font-semibold text-surface-700 mb-1.5 uppercase tracking-wide"
                  >
                    Código de verificación
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
                      <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </div>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className="w-full pl-10 pr-3 py-2.5 text-[14px] tracking-[0.3em] font-mono bg-white text-surface-900
                        border border-surface-300 rounded-md
                        focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100
                        placeholder:text-surface-400 placeholder:tracking-normal placeholder:font-sans transition-colors"
                      placeholder="6 dígitos de tu app de autenticación"
                    />
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex items-center justify-center gap-2 py-3 px-5 text-[14px] font-semibold tracking-wide text-white
                  bg-surface-900 hover:bg-black
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-surface-900
                  rounded-lg
                  shadow-[0_4px_14px_-4px_rgba(9,21,38,0.45)]
                  transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
                  active:translate-y-[1px] active:shadow-[0_2px_8px_-3px_rgba(9,21,38,0.4)]"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando credenciales…
                  </>
                ) : (
                  <>
                    <span>{requiere2FA ? "Verificar" : "Ingresar"}</span>
                    <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Pie de la tarjeta — nota de seguridad */}
            <div className="border-t border-surface-200/80 px-6 py-3.5 bg-surface-50/50 rounded-b-md flex items-center gap-2 text-[11px] text-surface-500">
              <svg className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 4h.01M5 11V7a7 7 0 1114 0v4m-9 4h4a2 2 0 012 2v3a2 2 0 01-2 2h-4a2 2 0 01-2-2v-3a2 2 0 012-2z" />
              </svg>
              <span>Conexión cifrada. El acceso queda registrado para auditoría.</span>
            </div>
          </div>

          {/* Aviso de soporte */}
          <p className="mt-5 text-center text-[12px] text-surface-500">
            ¿Problemas para acceder? Contactá al administrador del sistema.
          </p>
        </div>
      </main>

      {/* ── Footer corporativo ── */}
      <footer className="relative z-10 border-t border-surface-200/70 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-surface-500">
          <span>© {new Date().getFullYear()} Carrot · Griffith_Dev. Todos los derechos reservados.</span>
          <span className="font-mono tracking-tight">v1.0 · Producción</span>
        </div>
      </footer>
    </div>
  );
}

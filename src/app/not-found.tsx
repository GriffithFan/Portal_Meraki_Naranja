import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 dark:bg-surface-900 px-4 text-center">
      <p className="text-5xl font-bold text-primary-500">404</p>
      <h1 className="mt-3 text-lg font-semibold text-surface-800 dark:text-surface-100">Página no encontrada</h1>
      <p className="mt-1 text-sm text-surface-400 max-w-md">
        La página que buscás no existe o fue movida.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 px-4 py-2 rounded-lg text-sm font-medium bg-surface-800 text-white hover:bg-surface-700 transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  );
}

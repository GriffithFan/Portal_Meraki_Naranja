"use client";

import { useEffect, useRef, ReactNode } from "react";
import clsx from "clsx";
import { IconX } from "@/components/ui/Icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Ancho máximo del panel. Default "max-w-md". */
  maxWidth?: string;
  /** z-index del overlay. Default 50. Usar 60+ para modales anidados. */
  zIndex?: number;
  /** Oculta el botón X del header. */
  hideClose?: boolean;
}

/**
 * Modal accesible reutilizable: overlay con click-afuera y Esc para cerrar,
 * scroll-lock del body, foco inicial dentro del panel y restauración del foco
 * al cerrar. Reemplaza los overlays `fixed inset-0` copiados en varias páginas.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
  zIndex = 50,
  hideClose = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    lastFocused.current = document.activeElement as HTMLElement | null;

    // Scroll-lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        // Focus trap
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);

    // Foco inicial dentro del panel
    const t = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([disabled])'
      );
      focusable?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
      lastFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/30 p-4"
      style={{ zIndex }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={clsx(
          "bg-white dark:bg-surface-800 rounded-xl shadow-xl w-full max-h-[90vh] overflow-y-auto",
          maxWidth
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between p-5 pb-0">
            {title ? (
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100">{title}</h2>
            ) : <span />}
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="text-surface-400 hover:text-surface-600"
              >
                <IconX className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

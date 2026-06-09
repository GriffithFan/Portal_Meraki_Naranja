"use client";

import { ReactNode } from "react";
import clsx from "clsx";
import Modal from "@/components/ui/Modal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "normal";
  loading?: boolean;
}

/**
 * Diálogo de confirmación reutilizable (sobre <Modal>). Reemplaza los
 * "¿Eliminar …?" duplicados en las páginas.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm" zIndex={60} hideClose>
      <div className="text-xs text-surface-500 dark:text-surface-400 mb-4">{message}</div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={clsx(
            "px-3 py-1.5 text-white rounded-md text-xs font-medium disabled:opacity-50",
            variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-surface-800 hover:bg-surface-700"
          )}
        >
          {loading ? "..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

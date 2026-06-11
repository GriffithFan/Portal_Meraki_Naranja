"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "normal";
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface DialogState extends ConfirmOptions {
  open: boolean;
}

/**
 * Proveedor global de confirmación. Reemplaza el `window.confirm()` nativo
 * por un diálogo propio de la app (ConfirmDialog), con API basada en promesas:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm("¿Eliminar este mensaje?"))) return;
 *   // o: await confirm({ title, message, confirmLabel, variant })
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts: ConfirmOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, ...opts });
    });
  }, []);

  const settle = (value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!state?.open}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={state?.title ?? "Confirmar"}
        message={state?.message ?? ""}
        confirmLabel={state?.confirmLabel ?? "Aceptar"}
        cancelLabel={state?.cancelLabel ?? "Cancelar"}
        variant={state?.variant ?? "danger"}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}

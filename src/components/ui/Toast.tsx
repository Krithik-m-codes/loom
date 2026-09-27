import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  pushToast: (message: string, kind: ToastKind) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, kind: ToastKind) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    if (kind !== "error") {
      window.setTimeout(() => dismissToast(id), 5000);
    }
    return id;
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ pushToast, dismissToast }}>
      {children}
      <div className="loom-toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`loom-toast loom-toast--${toast.kind}`} data-kind={toast.kind}>
            <span className="loom-toast__message">{toast.message}</span>
            <button type="button" className="loom-toast__dismiss" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

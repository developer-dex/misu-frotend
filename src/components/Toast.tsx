import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastState {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: ToastAction;
}

type Show = (message: string, options?: { tone?: 'default' | 'error'; action?: ToastAction }) => void;

const ToastContext = createContext<Show>(() => {});

export function useToast(): Show {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<Show>((message, options = {}) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, tone: options.tone ?? 'default', action: options.action });
    timer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), options.action ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'toast-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

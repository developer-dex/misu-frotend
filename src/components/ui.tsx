import { useEffect, useRef, type ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';

export function Panel({
  title,
  aside,
  children,
  className = '',
  id,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`panel ${className}`} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || aside) && (
        <header className="panel-head">
          {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
          {aside && <div className="panel-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`One less ${label}`}>
        <Minus size={18} strokeWidth={2} />
      </button>
      <output className="stepper-value" aria-live="polite">
        {value}
      </output>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`One more ${label}`}>
        <Plus size={18} strokeWidth={2} />
      </button>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <p>{message}</p>
      <button type="button" className="btn btn-quiet" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** A modal sheet: slides up from the bottom on a phone, centred on a wide screen. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-body">
          <header className="sheet-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** A rupee amount input with the ₹ sign inside the box. */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0',
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="money-input">
      <span aria-hidden="true">₹</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      />
    </div>
  );
}

export function toAmount(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  InfoIcon,
  XIcon,
} from './icons';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastContextValue {
  show(tone: ToastTone, message: string): number;
  success(message: string): number;
  error(message: string): number;
  info(message: string): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4500;

const toneStyles: Record<ToastTone, string> = {
  success: 'border-success-500/30 bg-white text-ink',
  error: 'border-danger-500/30 bg-white text-ink',
  info: 'border-primary-400/30 bg-white text-ink',
};

const toneIconStyles: Record<ToastTone, string> = {
  success: 'text-success-600',
  error: 'text-danger-600',
  info: 'text-primary-600',
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [...current.slice(-2), { id, tone, message }]);

      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
      dismiss,
    }),
    [dismiss, show],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] mx-auto flex w-full max-w-app flex-col gap-2 px-4"
      >
        {toasts.map((toast) => {
          const Icon =
            toast.tone === 'success'
              ? CheckCircleIcon
              : toast.tone === 'error'
                ? AlertCircleIcon
                : InfoIcon;

          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-card animate-toast-in ${toneStyles[toast.tone]}`}
            >
              <Icon
                size={20}
                className={`mt-0.5 shrink-0 ${toneIconStyles[toast.tone]}`}
              />
              <p className="flex-1 text-sm font-medium leading-snug">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t('components.toast.dismiss')}
                className="-mr-1 rounded-full p-1 text-ink-faint transition hover:bg-surface-sunken hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

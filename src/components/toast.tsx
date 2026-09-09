'use client';

import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastData {
  id: number;
  type: ToastType;
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}

const TOAST_STYLE: Record<ToastType, {
  icon: typeof CheckCircle2;
  box: string;
  iconColor: string;
}> = {
  success: {
    icon: CheckCircle2,
    box: 'border-emerald-500/40 text-emerald-50',
    iconColor: 'text-emerald-400',
  },
  error: {
    icon: AlertCircle,
    box: 'border-rose-500/40 text-rose-50',
    iconColor: 'text-rose-400',
  },
  info: {
    icon: Info,
    box: 'border-indigo-500/40 text-indigo-50',
    iconColor: 'text-indigo-400',
  },
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 w-full max-w-sm">
      {toasts.map((toast) => {
        const style = TOAST_STYLE[toast.type];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`flex items-start gap-3 bg-slate-900/95 backdrop-blur border ${style.box} rounded-xl px-4 py-3 shadow-2xl duration-200`}
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.iconColor}`} />
            <p className="text-sm leading-snug flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-500 hover:text-white transition-colors shrink-0"
              aria-label="Fermer la notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
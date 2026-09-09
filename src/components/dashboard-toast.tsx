'use client';

import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type DashToastType = 'success' | 'error' | 'info';

export interface DashToastData {
  id: number;
  type: DashToastType;
  message: string;
}

export function useDashToasts() {
  const [toasts, setToasts] = useState<DashToastData[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: DashToastType, message: string) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}

const STYLE: Record<DashToastType, { icon: typeof CheckCircle2; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-200', iconColor: 'text-emerald-500' },
  error: { icon: AlertCircle, ring: 'border-rose-200', iconColor: 'text-rose-500' },
  info: { icon: Info, ring: 'border-indigo-200', iconColor: 'text-indigo-500' },
};

export function DashToastStack({
  toasts,
  onDismiss,
}: {
  toasts: DashToastData[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-3 w-full max-w-sm">
      {toasts.map((toast) => {
        const style = STYLE[toast.type];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`flex items-start gap-3 bg-white border ${style.ring} rounded-xl px-4 py-3 shadow-xl`}
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.iconColor}`} />
            <p className="text-sm text-slate-700 leading-snug flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
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

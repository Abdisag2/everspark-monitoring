'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastCtx {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info:    'bg-white border-slate-200 text-slate-700',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error:   'bg-rose-50 border-rose-200 text-rose-800',
};

const ICONS: Record<ToastVariant, React.ReactNode> = {
  info:    <Info size={15} className="text-slate-400" />,
  success: <CheckCircle size={15} className="text-emerald-500" />,
  warning: <AlertTriangle size={15} className="text-amber-500" />,
  error:   <AlertTriangle size={15} className="text-rose-500" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) =>
    setToasts((p) => p.filter((t) => t.id !== id)), []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((p) => [...p, { id, message, variant }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg animate-fade-in text-sm min-w-[260px] max-w-[380px]',
              VARIANT_STYLES[t.variant],
            )}
          >
            {ICONS[t.variant]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

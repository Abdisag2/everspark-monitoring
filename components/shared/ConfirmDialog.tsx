'use client';

import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Delete', danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={danger
              ? 'btn px-4 py-2.5 bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]'
              : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-rose-50 text-rose-500">
          <AlertTriangle size={20} />
        </span>
        <p className="text-sm text-slate-600 leading-relaxed pt-1.5">{message}</p>
      </div>
    </Modal>
  );
}

'use client';

import { useLanguage } from '@/shared/i18n/useLanguage';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-game confirmation modal replacing window.confirm().
 * Uses backdrop blur overlay + animated casino-styled panel.
 */
export default function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  const { t } = useLanguage();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-3xl border-2 border-yellow-500/40 bg-gray-900/95 p-6 shadow-[0_0_60px_rgba(234,179,8,0.15)] animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-center text-lg font-bold text-yellow-100 text-outline-sm">{title}</h3>
        <p className="mt-3 text-center text-sm leading-relaxed text-white/70">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="btn-cartoon flex-1 border-gray-700 bg-gray-600 py-3 text-sm text-white/80 hover:bg-gray-500"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="btn-cartoon flex-1 border-red-700 bg-red-500 py-3 text-sm text-white hover:bg-red-400"
          >
            {t.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useId, useRef } from 'react';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-3xl border border-[#416e4e] bg-[#0a2719] p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
      <div className="p-6">
        <h2 id={titleId} className="text-center text-lg font-bold text-[#f3e6b3]">{title}</h2>
        <p id={descriptionId} className="mt-3 text-center text-sm leading-relaxed text-white/80">{message}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} className="btn-cartoon min-h-11 flex-1 border-[#355a41] bg-[#163824] py-2.5 text-sm text-white hover:bg-[#1e4930]">{t.common.cancel}</button>
          <button type="button" onClick={onConfirm} className="btn-cartoon min-h-11 flex-1 border-red-700/80 bg-red-800/90 py-2.5 text-sm text-white hover:bg-red-700">{t.common.confirm}</button>
        </div>
      </div>
    </dialog>
  );
}

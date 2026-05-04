'use client';

import { Language } from '@/shared/i18n/useLanguage';

interface LanguageToggleProps {
  language: Language;
  onToggle: () => void;
  className?: string;
}

export default function LanguageToggle({
  language,
  onToggle,
  className = '',
}: LanguageToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`btn-cartoon inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold tracking-[0.24em] text-white/85 ${className}`.trim()}
      title={language === 'en' ? 'Cambiar a Espanol' : 'Switch to English'}
      aria-label={language === 'en' ? 'Switch language to Spanish' : 'Switch language to English'}
    >
      <span aria-hidden="true">{language === 'en' ? 'ES' : 'EN'}</span>
      <span className="text-white/45">/</span>
      <span className="text-white/55" aria-hidden="true">{language === 'en' ? 'EN' : 'ES'}</span>
    </button>
  );
}

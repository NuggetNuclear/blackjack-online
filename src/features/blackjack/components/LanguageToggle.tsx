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
      className={`btn-cartoon casino-language ${className}`.trim()}
      title={language === 'en' ? 'Cambiar a Español' : 'Switch to English'}
      aria-label={language === 'en' ? 'Switch language to Spanish' : 'Switch language to English'}
    >
      <span aria-hidden="true">{language === 'en' ? 'ES' : 'EN'}</span>
      <span className="casino-language__divider" aria-hidden="true">/</span>
      <span className="casino-language__current" aria-hidden="true">{language.toUpperCase()}</span>
    </button>
  );
}

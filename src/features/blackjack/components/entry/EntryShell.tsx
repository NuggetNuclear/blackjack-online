'use client';

import type { ReactNode } from 'react';
import Card from '@/features/blackjack/components/Card';
import CasinoBrand from '@/features/blackjack/components/CasinoBrand';
import TableSurface from '@/features/blackjack/components/TableSurface';
import LanguageToggle from '@/features/blackjack/components/LanguageToggle';
import { useLanguage } from '@/shared/i18n/useLanguage';

export default function EntryShell({ children }: { children: ReactNode }) {
  const { language, setLanguage } = useLanguage();
  return (
    <main className="entry-screen casino-scene">
      <TableSurface bottomInset={28} />
      <header className="entry-header">
        <CasinoBrand heading />
        <LanguageToggle language={language} onToggle={() => setLanguage(language === 'es' ? 'en' : 'es')} className="entry-language" />
      </header>
      <div className="entry-stage">
        <div className="entry-stack">
          <div className="entry-art" aria-hidden="true">
            <div className="entry-art-card entry-art-card--back"><Card card={{ rank: '2', suit: 'spades', faceUp: false }} animated={false} /></div>
            <div className="entry-art-card entry-art-card--ace"><Card card={{ rank: 'A', suit: 'spades', faceUp: true }} animated={false} /></div>
            <div className="entry-art-card entry-art-card--king"><Card card={{ rank: 'K', suit: 'hearts', faceUp: true }} animated={false} /></div>
          </div>
          <section className="entry-panel">{children}</section>
        </div>
      </div>
    </main>
  );
}

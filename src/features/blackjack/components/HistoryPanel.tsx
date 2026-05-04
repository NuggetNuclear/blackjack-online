'use client';

import { useState } from 'react';
import { BetRecord, formatRecord } from '@/features/blackjack/lib/history';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface HistoryPanelProps {
  history: BetRecord[];
  bottomOffset: number;
}

export default function HistoryPanel({ history, bottomOffset }: HistoryPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <button
        type="button"
        onClick={() => setHistoryOpen(!historyOpen)}
        className="fixed z-50 rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-sm font-bold text-yellow-200/85 backdrop-blur transition-colors hover:bg-black/80"
        style={{ right: '16px', bottom: `${16 + bottomOffset}px` }}
        aria-expanded={historyOpen}
        aria-haspopup="dialog"
      >
        {t.history.title}
      </button>
      {historyOpen && (
        <div
          className="panel-surface fixed right-4 z-50 max-h-80 w-72 animate-fade-in overflow-hidden"
          style={{ bottom: `${56 + bottomOffset}px` }}
        >
          <div className="p-4 overflow-y-auto max-h-80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-yellow-300 text-sm font-bold uppercase tracking-wider text-outline-sm">{t.history.title}</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-sm font-bold text-white/50 hover:text-white/80"
                aria-label={`Close ${t.history.title}`}
              >
                ✕
              </button>
            </div>
            {history.length === 0 && <p className="text-white/40 text-xs font-semibold">{t.history.empty}</p>}
            {[...history].reverse().map((r) => (
              <div key={`${r.round}-${r.timestamp}`} className="border-b border-white/10 py-2 text-[11px] font-medium text-white/70">
                {formatRecord(r)}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

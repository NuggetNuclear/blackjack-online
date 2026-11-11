'use client';

import { useEffect, useState } from 'react';
import { BetRecord } from '@/features/blackjack/lib/history';
import { formatCurrency } from '@/shared/lib/format';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface HistoryPanelProps {
  history: BetRecord[];
  bottomOffset: number;
}

export default function HistoryPanel({ history, bottomOffset }: HistoryPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setHistoryOpen(!historyOpen)}
        className="fixed right-2.5 sm:right-4 z-30 rounded-full border border-[#416e4e]/70 bg-[#082015]/88 px-2.5 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs font-bold text-[#ead79c] backdrop-blur-md transition-colors hover:bg-[#113d24] shadow-md"
        style={{ bottom: `${10 + bottomOffset}px` }}
        aria-expanded={historyOpen}
      >
        {t.history.title}
        {history.length > 0 && (
          <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/75 tabular-nums">
            {history.length}
          </span>
        )}
      </button>
      {historyOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setHistoryOpen(false)}
            aria-hidden="true"
          />
          <div
            className="panel-surface fixed right-2.5 sm:right-4 z-50 max-h-80 w-[min(92vw,310px)] animate-fade-in overflow-hidden shadow-2xl"
            style={{ bottom: `${46 + bottomOffset}px` }}
            role="dialog"
            aria-label={t.history.title}
          >
            <div className="p-3.5 sm:p-4 overflow-y-auto max-h-80">
              <div className="flex items-center justify-between mb-2.5 border-b border-white/10 pb-2">
                <span className="text-[#ead79c] text-xs sm:text-sm font-bold uppercase tracking-wider">
                  {t.history.title}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-lg px-2 py-0.5 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label={`Close ${t.history.title}`}
                >
                  ✕
                </button>
              </div>
              {history.length === 0 && (
                <p className="text-white/45 text-xs font-medium py-3 text-center">{t.history.empty}</p>
              )}
              <div className="divide-y divide-white/10">
                {[...history].reverse().map((r) => {
                  const net = r.result === 'lose' ? -r.bet : r.result === 'push' ? 0 : r.payout - r.bet;
                  const netStr =
                    net > 0 ? `+${formatCurrency(net)}` : net < 0 ? `-${formatCurrency(Math.abs(net))}` : formatCurrency(0);
                  const netColor =
                    net > 0
                      ? 'text-emerald-300 border-emerald-400/35 bg-emerald-950/60'
                      : net < 0
                        ? 'text-red-300 border-red-400/35 bg-red-950/60'
                        : 'text-white/70 border-white/20 bg-white/5';
                  return (
                    <div
                      key={`${r.round}-${r.timestamp}`}
                      className="flex items-center justify-between gap-2 py-2 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-semibold text-white/85">
                          <span className="text-[#ead79c]/80 tabular-nums">#{r.round}</span>
                          <span className="uppercase text-[10px] tracking-wide text-white/65">{r.result}</span>
                        </div>
                        <div className="truncate text-[10px] text-white/50 tabular-nums mt-0.5">
                          {t.betting.bet}: {formatCurrency(r.bet)} · {t.common.balance}: {formatCurrency(r.balanceAfter)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${netColor}`}
                      >
                        {netStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

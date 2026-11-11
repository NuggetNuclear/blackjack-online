'use client';

import { useState } from 'react';
import Chip from './Chip';
import { sounds } from '@/features/blackjack/lib/sounds';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

interface BettingPanelProps {
  balance: number;
  currentBet: number;
  onBetChange: (amount: number) => void;
  onConfirmBet: () => void;
  onAllIn: () => void;
  disabled?: boolean;
  // BUG-FIX: New prop to hard-disable all betting when countdown expires.
  // Previously, the panel remained interactive after the 20s timeout until the
  // host's phase transition arrived, allowing ghost bets.
  bettingTimeExpired: boolean;
}

const CHIP_VALUES = [5, 25, 100, 500, 5000];

export default function BettingPanel({
  balance,
  currentBet,
  onBetChange,
  onConfirmBet,
  onAllIn,
  disabled,
  bettingTimeExpired,
}: BettingPanelProps) {
  const { t } = useLanguage();
  const [clickLocked, setClickLocked] = useState(false);

  // Merge `disabled` with `bettingTimeExpired` and `clickLocked`
  const isLocked = disabled || bettingTimeExpired || clickLocked;

  const addChip = (value: number) => {
    if (isLocked) return;
    if (currentBet + value <= balance) {
      sounds.chipPlace();
      onBetChange(currentBet + value);
    }
  };

  const removeChip = (value: number) => {
    if (isLocked) return;
    if (currentBet - value >= 0) {
      onBetChange(currentBet - value);
    }
  };

  return (
    <div className={`flex w-full max-w-md flex-col items-center gap-1.5 sm:gap-2.5 px-1 sm:px-2 animate-fade-in ${bettingTimeExpired ? 'opacity-50' : ''}`}>
      {/* Top status slot with reserved height to eliminate vertical layout shift */}
      <div className="min-h-[26px] sm:min-h-[32px] flex items-center justify-center">
        {bettingTimeExpired ? (
          <div className="rounded-full border border-red-500/30 bg-red-900/40 px-3 py-0.5 text-[11px] sm:text-xs font-bold uppercase tracking-widest text-red-300 animate-bounce-in tabular-nums">
            {t.betting.closesIn} 0s
          </div>
        ) : currentBet > 0 ? (
          <div className="rounded-full border border-yellow-500/25 bg-black/45 px-3 py-0.5 sm:px-4 sm:py-1 text-xs sm:text-base font-bold text-yellow-300 text-outline-sm tabular-nums">
            {t.betting.bet}: {formatCurrency(currentBet)}
          </div>
        ) : (
          <span className="text-[11px] sm:text-xs font-semibold text-white/50">{t.game.betting}</span>
        )}
      </div>

      <div className="flex max-w-full items-start justify-center gap-1.5 sm:gap-2.5">
        {CHIP_VALUES.map((value, i) => (
          <div key={value} className="flex flex-col items-center gap-1">
            <Chip
              value={value}
              onClick={() => addChip(value)}
              disabled={isLocked || currentBet + value > balance}
              size="md"
              animated={true}
              animIndex={i}
            />
            <div className="h-[22px] sm:h-[26px] flex items-center justify-center">
              {currentBet >= value && (
                <button
                  type="button"
                  onClick={() => removeChip(value)}
                  className="min-h-[20px] sm:min-h-[24px] rounded-full border border-red-400/35 bg-black/60 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-red-200 hover:bg-red-950/70 transition-colors tabular-nums"
                  disabled={isLocked}
                >
                  -{value >= 1000 ? `${value / 1000}K` : value}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3">
        <button
          type="button"
          onClick={() => {
            if (!isLocked) {
              setClickLocked(true);
              sounds.bet();
              onAllIn();
              setTimeout(() => setClickLocked(false), 350);
            }
          }}
          disabled={isLocked || balance <= 0}
          className="btn-cartoon min-h-[38px] sm:min-h-[46px] px-3.5 sm:px-6 py-1.5 sm:py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600
            text-white text-xs sm:text-sm border-red-800"
        >
          {t.betting.allIn}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!isLocked) {
              setClickLocked(true);
              sounds.bet();
              onConfirmBet();
              setTimeout(() => setClickLocked(false), 350);
            }
          }}
          disabled={isLocked || currentBet <= 0}
          className="btn-cartoon min-h-[38px] sm:min-h-[46px] px-4 sm:px-7 py-1.5 sm:py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-600
            text-gray-950 text-xs sm:text-sm border-yellow-700"
        >
          {t.betting.deal}
        </button>

        {currentBet > 0 && (
          <button
            type="button"
            onClick={() => { if (!isLocked) onBetChange(0); }}
            disabled={isLocked}
            className="btn-cartoon min-h-[38px] sm:min-h-[46px] px-3 sm:px-4 py-1.5 sm:py-2 bg-[#14502a] hover:bg-[#1c6833]
              text-white/90 text-xs border-[#082712]"
          >
            {t.betting.clear}
          </button>
        )}
      </div>
    </div>
  );
}

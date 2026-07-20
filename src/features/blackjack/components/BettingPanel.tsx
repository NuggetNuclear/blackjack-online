'use client';

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

  // BUG-FIX: Merge `disabled` with `bettingTimeExpired` to create a single
  // interactivity gate. When time expires, ALL chip/button interactions are blocked.
  const isLocked = disabled || bettingTimeExpired;

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
    <div className={`flex flex-col items-center gap-3 animate-fade-in ${bettingTimeExpired ? 'opacity-50' : ''}`}>
      {/* BUG-FIX: Show "Time's Up!" overlay when betting window closes */}
      {bettingTimeExpired && (
        <div className="rounded-full border border-red-500/30 bg-red-900/40 px-4 py-1.5 text-sm font-bold uppercase tracking-widest text-red-300 animate-bounce-in">
          {t.betting.closesIn} 0s
        </div>
      )}

      {currentBet > 0 && !bettingTimeExpired && (
        <div className="rounded-full border border-yellow-500/15 bg-black/25 px-4 py-2 text-xl font-bold text-yellow-300 text-outline-sm animate-bounce-in">
          {t.betting.bet}: {formatCurrency(currentBet)}
        </div>
      )}

      <div className="flex gap-2.5 items-end">
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
            {currentBet >= value && (
              <button
                onClick={() => removeChip(value)}
                className="text-[10px] text-red-400/80 hover:text-red-300 transition-colors font-semibold"
                disabled={isLocked}
              >
                {t.betting.undo}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => { if (!isLocked) { sounds.bet(); onAllIn(); } }}
          disabled={isLocked || balance <= 0}
          className="btn-cartoon btn-fire px-6 py-2.5 bg-red-500 hover:bg-red-400 disabled:bg-gray-600
            text-white text-sm border-red-700"
        >
          🔥 {t.betting.allIn} 🔥
        </button>

        <button
          onClick={() => { if (!isLocked) { sounds.bet(); onConfirmBet(); } }}
          disabled={isLocked || currentBet <= 0}
          className="btn-cartoon px-6 py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-600
            text-gray-900 text-sm border-yellow-600"
        >
          {t.betting.deal}
        </button>

        {currentBet > 0 && (
          <button
            onClick={() => { if (!isLocked) onBetChange(0); }}
            disabled={isLocked}
            className="btn-cartoon px-4 py-2.5 bg-gray-500 hover:bg-gray-400
              text-white/80 text-xs border-gray-700"
          >
            {t.betting.clear}
          </button>
        )}
      </div>
    </div>
  );
}

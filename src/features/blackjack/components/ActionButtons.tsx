'use client';

import { useState, useCallback } from 'react';
import { sounds } from '@/features/blackjack/lib/sounds';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface ActionButtonsProps {
  onHit: () => void;
  onStand: () => void;
  onDoubleDown: () => void;
  canDoubleDown: boolean;
  disabled: boolean;
  onSurrender?: () => void;
  canSurrender?: boolean;
  onSplit?: () => void;
  canSplit?: boolean;
}

export default function ActionButtons({
  onHit,
  onStand,
  onDoubleDown,
  canDoubleDown,
  disabled,
  onSurrender,
  canSurrender,
  onSplit,
  canSplit,
}: ActionButtonsProps) {
  const { t } = useLanguage();
  const [locked, setLocked] = useState(false);

  const triggerAction = useCallback(
    (actionFn: () => void) => {
      if (disabled || locked) return;
      setLocked(true);
      actionFn();
      setTimeout(() => setLocked(false), 350);
    },
    [disabled, locked]
  );

  const isActionBlocked = disabled || locked;
  const doubleDisabled = isActionBlocked || !canDoubleDown;

  return (
    <div className="flex max-w-full flex-wrap justify-center gap-2 sm:gap-3 px-2 animate-fade-in">
      <button
        type="button"
        onClick={() => triggerAction(() => { sounds.hit(); onHit(); })}
        disabled={isActionBlocked}
        className="btn-cartoon min-h-[42px] sm:min-h-[48px] px-5 sm:px-7 py-2 sm:py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600
          text-white text-xs sm:text-base border-emerald-800"
      >
        {t.common.hit}
      </button>

      <button
        type="button"
        onClick={() => triggerAction(() => { sounds.stand(); onStand(); })}
        disabled={isActionBlocked}
        className="btn-cartoon min-h-[42px] sm:min-h-[48px] px-5 sm:px-7 py-2 sm:py-3 bg-red-600 hover:bg-red-500 disabled:bg-gray-600
          text-white text-xs sm:text-base border-red-800"
      >
        {t.common.stand}
      </button>

      <button
        type="button"
        onClick={() => triggerAction(() => { sounds.hit(); onDoubleDown(); })}
        disabled={doubleDisabled}
        aria-disabled={doubleDisabled}
        className={`btn-cartoon min-h-[42px] sm:min-h-[48px] px-4 sm:px-5 py-2 sm:py-3 text-xs sm:text-base ${
          doubleDisabled
            ? 'border-gray-800 bg-gray-700 text-white/50'
            : 'border-amber-700 bg-yellow-400 text-gray-950 hover:bg-yellow-300'
        }`}
      >
        {t.common.double}
      </button>

      {canSplit && onSplit && (
        <button
          type="button"
          onClick={() => triggerAction(() => { sounds.hit(); onSplit(); })}
          disabled={isActionBlocked}
          className="btn-cartoon min-h-[42px] sm:min-h-[48px] px-4 sm:px-5 py-2 sm:py-3 bg-[#1c6833] hover:bg-[#23753a] disabled:bg-gray-600
            text-white text-xs sm:text-base border-[#082712]"
        >
          {t.common.split}
        </button>
      )}

      {canSurrender && onSurrender && (
        <button
          type="button"
          onClick={() => triggerAction(() => { sounds.stand(); onSurrender(); })}
          disabled={isActionBlocked}
          className="btn-cartoon min-h-[42px] sm:min-h-[48px] px-4 sm:px-5 py-2 sm:py-3 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-600
            text-white text-xs sm:text-base border-amber-900"
        >
          {t.common.surrender}
        </button>
      )}
    </div>
  );
}

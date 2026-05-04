'use client';

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
  const doubleDisabled = disabled || !canDoubleDown;
  return (
    <div className="flex gap-3 justify-center animate-fade-in flex-wrap">
      <button
        onClick={() => { sounds.hit(); onHit(); }}
        disabled={disabled}
        className="btn-cartoon px-7 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-600
          text-white text-base border-emerald-700"
      >
        {t.common.hit}
      </button>

      <button
        onClick={() => { sounds.stand(); onStand(); }}
        disabled={disabled}
        className="btn-cartoon px-7 py-3 bg-red-500 hover:bg-red-400 disabled:bg-gray-600
          text-white text-base border-red-700"
      >
        {t.common.stand}
      </button>

      <button
        onClick={() => { sounds.hit(); onDoubleDown(); }}
        disabled={doubleDisabled}
        aria-disabled={doubleDisabled}
        className={`btn-cartoon px-5 py-3 text-base ${
          doubleDisabled
            ? 'border-slate-700 bg-slate-700 text-white/50'
            : 'border-purple-700 bg-purple-500 text-white hover:bg-purple-400'
        }`}
      >
        {t.common.double}
      </button>

      {canSplit && onSplit && (
        <button
          onClick={() => { sounds.hit(); onSplit(); }}
          disabled={disabled}
          className="btn-cartoon px-5 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-600
            text-white text-base border-cyan-700"
        >
          {t.common.split}
        </button>
      )}

      {canSurrender && onSurrender && (
        <button
          onClick={() => { sounds.stand(); onSurrender(); }}
          disabled={disabled}
          className="btn-cartoon px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600
            text-white text-base border-amber-700"
        >
          {t.common.surrender}
        </button>
      )}
    </div>
  );
}

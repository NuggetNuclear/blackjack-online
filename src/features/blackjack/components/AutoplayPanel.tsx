'use client';

import { useState } from 'react';
import { useLanguage } from '@/shared/i18n/useLanguage';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';

interface AutoplayPanelProps {
  config: AutoplayConfig;
  onChange: (config: AutoplayConfig) => void;
}

export default function AutoplayPanel({ config, onChange }: AutoplayPanelProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  const toggleEnabled = () => onChange({ ...config, enabled: !config.enabled });

  const BET_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: t.autoplay.manual },
    { value: 25, label: '$25' },
    { value: 50, label: '$50' },
    { value: 100, label: '$100' },
    { value: 500, label: '$500' },
    { value: -1, label: `🔥 ${t.autoplay.allIn}` },
  ];

  const STAND_OPTIONS = [15, 16, 17, 18, 19];

  const activeBetLabel = BET_OPTIONS.find((o) => o.value === config.autoBet)?.label ?? `$${config.autoBet}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`btn-cartoon px-3 py-1.5 text-xs transition-all flex items-center gap-1.5
          ${config.enabled
            ? 'bg-amber-500 text-white border-amber-700'
            : 'bg-gray-600 text-white/60 border-gray-700 hover:bg-gray-500'
          }`}
      >
        🤖 {config.enabled ? t.autoplay.on : t.autoplay.off}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 bg-gray-900/98 border-[3px] border-amber-500/60 rounded-2xl shadow-2xl animate-bounce-in z-[70] w-[260px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10">
            <span className="text-white text-sm font-bold">🤖 {t.autoplay.title}</span>
            <button
              onClick={toggleEnabled}
              className={`relative w-10 h-5 rounded-full transition-colors ${config.enabled ? 'bg-amber-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className={`px-4 py-3 space-y-3 ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
            {/* Auto-bet selection */}
            <div>
              <div className="text-amber-300/90 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">{t.autoplay.autoBet}</div>
              <div className="grid grid-cols-3 gap-1">
                {BET_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => onChange({ ...config, autoBet: value })}
                    className={`btn-cartoon py-1 text-[10px] transition-all
                      ${config.autoBet === value
                        ? value === -1
                          ? 'bg-red-500 text-white border-red-700'
                          : 'bg-amber-500 text-white border-amber-700'
                        : 'bg-gray-700 text-white/60 border-gray-800 hover:bg-gray-600'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stand on */}
            <div>
              <div className="text-amber-300/90 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">{t.autoplay.standOn}</div>
              <div className="flex gap-1">
                {STAND_OPTIONS.map((val) => (
                  <button
                    key={val}
                    onClick={() => onChange({ ...config, standOn: val })}
                    className={`btn-cartoon flex-1 py-1 text-[11px] transition-all
                      ${config.standOn === val
                        ? 'bg-amber-500 text-white border-amber-700'
                        : 'bg-gray-700 text-white/60 border-gray-800 hover:bg-gray-600'
                      }`}
                  >
                    {val}+
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            {config.enabled && (
              <div className="text-white/50 text-[10px] bg-black/30 rounded-lg px-2.5 py-1.5 border border-white/5">
                {t.autoplay.bettingLabel} <span className="text-amber-300 font-bold">{activeBetLabel}</span> · {t.autoplay.standingAt} <span className="text-amber-300 font-bold">{config.standOn}+</span>
              </div>
            )}
          </div>

          {/* Close */}
          <div className="px-4 pb-3">
            <button
              onClick={() => setOpen(false)}
              className="btn-cartoon w-full py-1.5 bg-gray-700 hover:bg-gray-600 text-white/70 text-xs border-gray-800"
            >
              {t.common.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

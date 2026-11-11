'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const BET_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: t.autoplay.manual },
    { value: 25, label: '$25' },
    { value: 50, label: '$50' },
    { value: 100, label: '$100' },
    { value: 500, label: '$500' },
    { value: -1, label: t.autoplay.allIn },
  ];

  const STAND_OPTIONS = [15, 16, 17, 18, 19];

  const activeBetLabel = BET_OPTIONS.find((o) => o.value === config.autoBet)?.label ?? `$${config.autoBet}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`btn-cartoon min-h-[34px] sm:min-h-[36px] px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs transition-all flex items-center gap-1.5 whitespace-nowrap
          ${config.enabled
            ? 'bg-yellow-400 text-gray-950 border-yellow-700'
            : 'bg-[#14502a] text-white/90 border-[#082712] hover:bg-[#1c6833]'
          }`}
      >
        {config.enabled ? t.autoplay.on : t.autoplay.off}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[65] bg-black/35"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="panel-surface fixed inset-x-3 top-14 mx-auto z-[70] w-[min(92vw,280px)] max-h-[calc(var(--app-height,100dvh)-4rem)] overflow-y-auto animate-fade-in sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[270px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-white/10">
              <span className="text-yellow-200 text-sm font-bold">{t.autoplay.title}</span>
              <button
                type="button"
                onClick={toggleEnabled}
                aria-label={t.autoplay.title}
                aria-pressed={config.enabled}
                className={`relative w-11 h-6 rounded-full transition-colors ${config.enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${config.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>

            <div className={`px-4 py-3 space-y-3 ${!config.enabled ? 'opacity-45 pointer-events-none' : ''}`}>
              {/* Auto-bet selection */}
              <div>
                <div className="text-yellow-200/90 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">{t.autoplay.autoBet}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {BET_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!config.enabled}
                      onClick={() => onChange({ ...config, autoBet: value })}
                      className={`btn-cartoon min-h-[34px] py-1 text-[10px] transition-all tabular-nums
                        ${config.autoBet === value
                          ? value === -1
                            ? 'bg-red-600 text-white border-red-800'
                            : 'bg-yellow-400 text-gray-950 border-yellow-700'
                          : 'bg-[#0c321f] text-white/80 border-[#082712] hover:bg-[#14502a]'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stand on */}
              <div>
                <div className="text-yellow-200/90 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">{t.autoplay.standOn}</div>
                <div className="flex gap-1.5">
                  {STAND_OPTIONS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      disabled={!config.enabled}
                      onClick={() => onChange({ ...config, standOn: val })}
                      className={`btn-cartoon min-h-[34px] flex-1 py-1 text-[11px] transition-all tabular-nums
                        ${config.standOn === val
                          ? 'bg-yellow-400 text-gray-950 border-yellow-700'
                          : 'bg-[#0c321f] text-white/80 border-[#082712] hover:bg-[#14502a]'
                        }`}
                    >
                      {val}+
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {config.enabled && (
                <div className="text-white/75 text-[11px] bg-black/30 rounded-xl px-3 py-2 border border-white/10 tabular-nums">
                  {t.autoplay.bettingLabel} <span className="text-yellow-300 font-bold">{activeBetLabel}</span> · {t.autoplay.standingAt} <span className="text-yellow-300 font-bold">{config.standOn}+</span>
                </div>
              )}
            </div>

            {/* Close */}
            <div className="px-4 pb-3.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-cartoon min-h-[38px] w-full py-1.5 bg-[#14502a] hover:bg-[#1c6833] text-white/90 text-xs border-[#082712]"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

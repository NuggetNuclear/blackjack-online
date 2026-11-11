'use client';

import { useEffect, useState } from 'react';
import AutoplayPanel from '@/features/blackjack/components/AutoplayPanel';
import CasinoBrand from '@/features/blackjack/components/CasinoBrand';
import LanguageToggle from '@/features/blackjack/components/LanguageToggle';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

const BOTTOM_OFFSET_OPTIONS = [0, 16, 32] as const;

interface GameHeaderProps {
  roomCode: string;
  copied: boolean;
  isSpectator: boolean;
  balance: number;
  leaderName: string;
  autoplay: AutoplayConfig;
  onAutoplayChange: (cfg: AutoplayConfig) => void;
  soundOn: boolean;
  setSoundOn: (s: boolean) => void;
  bottomOffsetIndex: number;
  setBottomOffsetIndex: (i: number) => void;
  onCopyLink: () => void;
  onSwitchToSpectator: () => void;
  onExitRoom: () => void;
}

export default function GameHeader({
  roomCode,
  copied,
  isSpectator,
  balance,
  leaderName,
  autoplay,
  onAutoplayChange,
  soundOn,
  setSoundOn,
  bottomOffsetIndex,
  setBottomOffsetIndex,
  onCopyLink,
  onSwitchToSpectator,
  onExitRoom,
}: GameHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const bottomOffsetLabels = [t.header.edgeOff, t.header.edgeMid, t.header.edgeHigh] as const;
  const toggleLanguage = () => setLanguage(language === 'en' ? 'es' : 'en');

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  return (
    <header className="casino-game-header relative z-40 shrink-0 overflow-visible border-b-4 border-[#070f20] bg-[#0f172a] shadow-xl">
      {/* Desktop / Tablet Bar (>= 640px) */}
      <div className="hidden items-center justify-between gap-4 px-4 py-2.5 sm:flex">
        <div className="flex items-center gap-2.5">
          <CasinoBrand compact />
          <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/80">
            {t.header.leader}: <span className="text-white">{leaderName}</span>
          </span>
          {roomCode && (
            <button
              type="button"
              onClick={onCopyLink}
              className="btn-cartoon min-h-[36px] border-[#082712] bg-[#14502a] px-3 py-1 text-[11px] text-white hover:bg-[#1c6833] tabular-nums"
              title="Copy invite link"
            >
              {copied ? t.header.copied : `${t.header.room} ${roomCode}`}
            </button>
          )}
          {isSpectator ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
              {t.header.spectating}
            </span>
          ) : (
            <button
              type="button"
              onClick={onSwitchToSpectator}
              className="btn-cartoon min-h-[36px] border-[#082712] bg-[#14502a] px-3 py-1 text-[11px] text-white/90 hover:bg-[#1c6833]"
              title="Switch to spectating"
            >
              {t.header.spectate}
            </button>
          )}
          <button
            type="button"
            onClick={onExitRoom}
            className="btn-cartoon min-h-[36px] border-rose-950 bg-rose-800 px-3 py-1 text-[11px] text-rose-50 hover:bg-rose-700"
            title="Leave room"
          >
            {t.header.exit}
          </button>
        </div>

        {!isSpectator && (
          <div className="rounded-full border-b-[3px] border-[#082712] bg-[#14502a] px-4 py-1 text-center shadow-md tabular-nums">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/75">{t.common.balance}</span>
            <span className="text-base font-bold text-yellow-300">{formatCurrency(balance)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-visible">
          <LanguageToggle
            language={language}
            onToggle={toggleLanguage}
            className="min-h-[36px] border-white/12 bg-white/8 hover:bg-white/14"
          />
          {!isSpectator && <AutoplayPanel config={autoplay} onChange={onAutoplayChange} />}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="btn-cartoon min-h-[36px] border-white/12 bg-white/8 px-3 py-1 text-xs text-white hover:bg-white/14"
              title={t.header.settings}
              aria-expanded={settingsOpen}
            >
              {t.header.settings}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Compact Bar (< 640px) — 40px+ ergonomic touch targets, zero clutter */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <CasinoBrand compact />
          {roomCode && (
            <button
              type="button"
              onClick={onCopyLink}
              className="btn-cartoon min-h-[36px] shrink-0 border-[#082712] bg-[#14502a] px-2.5 py-1 text-[11px] font-bold text-yellow-200 tabular-nums"
              title="Copy invite link"
            >
              {copied ? t.header.copied : roomCode}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isSpectator ? (
            <div className="rounded-full border border-[#416e4e] bg-[#0c321f] px-2.5 py-1 text-xs font-bold text-yellow-300 tabular-nums">
              {formatCurrency(balance)}
            </div>
          ) : (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
              {t.header.spectating}
            </span>
          )}

          {!isSpectator && <AutoplayPanel config={autoplay} onChange={onAutoplayChange} />}

          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="btn-cartoon min-h-[36px] border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-white"
            title={t.header.settings}
            aria-expanded={settingsOpen}
          >
            {t.header.settings}
          </button>

          <button
            type="button"
            onClick={onExitRoom}
            className="btn-cartoon min-h-[36px] border-rose-950 bg-rose-800 px-2.5 py-1 text-[11px] text-rose-50"
            title="Leave room"
          >
            {t.header.exit}
          </button>
        </div>
      </div>

      {/* Shared Settings Popover / Sheet (with click-outside backdrop) */}
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-[65] bg-black/35"
            aria-hidden="true"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="panel-surface fixed right-3 top-14 z-[70] w-[min(90vw,260px)] animate-fade-in p-4 sm:absolute sm:right-4 sm:top-full sm:mt-2">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-sm font-bold text-yellow-200">{t.header.settings}</span>
              <span className="text-[11px] text-white/70 truncate max-w-[130px]">
                {t.header.leader}: <strong className="text-white">{leaderName}</strong>
              </span>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-xs font-semibold text-white/90">{t.header.sound}</span>
                <button
                  type="button"
                  onClick={() => setSoundOn(!soundOn)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${soundOn ? 'bg-emerald-500' : 'bg-gray-600'}`}
                  aria-pressed={soundOn}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${soundOn ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </label>

              <div className="flex items-center justify-between gap-3 sm:hidden">
                <span className="text-xs font-semibold text-white/90">EN / ES</span>
                <LanguageToggle
                  language={language}
                  onToggle={toggleLanguage}
                  className="min-h-[36px] border-white/15 bg-white/10 px-3 py-1 text-xs"
                />
              </div>

              {!isSpectator && (
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    onSwitchToSpectator();
                  }}
                  className="btn-cartoon min-h-[38px] w-full border-[#082712] bg-[#14502a] py-1.5 text-xs text-white hover:bg-[#1c6833] sm:hidden"
                >
                  {t.header.spectate}
                </button>
              )}

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-white/85">{t.header.edgeOffset}</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {BOTTOM_OFFSET_OPTIONS.map((offset, index) => (
                    <button
                      key={offset}
                      type="button"
                      onClick={() => setBottomOffsetIndex(index)}
                      className={`btn-cartoon min-h-[34px] py-1 text-[10px] ${
                        index === bottomOffsetIndex
                          ? 'border-yellow-700 bg-yellow-400 text-gray-950'
                          : 'border-[#082712] bg-[#0c321f] text-white/75'
                      }`}
                    >
                      {bottomOffsetLabels[index]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="btn-cartoon mt-3.5 min-h-[38px] w-full border-[#082712] bg-[#14502a] py-1.5 text-xs text-white/90 hover:bg-[#1c6833]"
            >
              {t.common.close}
            </button>
          </div>
        </>
      )}
    </header>
  );
}

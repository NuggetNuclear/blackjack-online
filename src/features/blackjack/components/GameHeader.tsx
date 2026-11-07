'use client';

import { useState } from 'react';
import AutoplayPanel from '@/features/blackjack/components/AutoplayPanel';
import LanguageToggle from '@/features/blackjack/components/LanguageToggle';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

const BOTTOM_OFFSET_OPTIONS = [0, 48, 88] as const;

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

  return (
    <div className="relative z-40 overflow-visible border-b-4 border-slate-950 bg-slate-900 shadow-xl">
      <div className="hidden items-center justify-between gap-4 px-4 py-3 sm:flex">
        <div className="flex items-center gap-2.5">
          <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-yellow-200">
            {t.header.title}
          </span>
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold text-white/75">
            {t.header.leader}: <span className="text-white">{leaderName}</span>
          </span>
          {roomCode && (
            <button
              type="button"
              onClick={onCopyLink}
              className="btn-cartoon border-white/10 bg-white/6 px-3 py-1.5 text-[11px] text-white/82 hover:bg-white/12"
              title="Copy invite link"
            >
              {copied ? t.header.copied : `${t.header.room} ${roomCode}`}
            </button>
          )}
          {isSpectator ? (
            <span className="rounded-full border border-sky-400/25 bg-sky-500/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-100">
              {t.header.spectating}
            </span>
          ) : (
            <button
              type="button"
              onClick={onSwitchToSpectator}
              className="btn-cartoon border-indigo-900 bg-indigo-600/75 px-3 py-1.5 text-[11px] text-indigo-50 hover:bg-indigo-500"
              title="Switch to spectating"
            >
              {t.header.spectate}
            </button>
          )}
          <button
            type="button"
            onClick={onExitRoom}
            className="btn-cartoon border-rose-950 bg-rose-800/85 px-3 py-1.5 text-[11px] text-rose-100 hover:bg-rose-700"
            title="Leave room"
          >
            {t.header.exit}
          </button>
        </div>

        {!isSpectator && (
          <div className="absolute left-1/2 -translate-x-1/2 rounded-full border-b-[3px] border-emerald-900 bg-emerald-800 px-5 py-2 text-center shadow-lg">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-100/70">{t.common.balance}</div>
            <div className="text-xl font-bold text-emerald-300 drop-shadow-md">{formatCurrency(balance)}</div>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-visible">
          <LanguageToggle
            language={language}
            onToggle={toggleLanguage}
            className="border-white/12 bg-white/6 hover:bg-white/12"
          />
          {!isSpectator && <AutoplayPanel config={autoplay} onChange={onAutoplayChange} />}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="btn-cartoon border-white/12 bg-white/6 px-3 py-1.5 text-xs text-white/82 hover:bg-white/12"
              title={t.header.settings}
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
            >
              {t.header.settings}
            </button>
            {settingsOpen && (
              <div className="panel-surface absolute top-full right-0 z-[70] mt-3 w-[230px] animate-bounce-in p-4">
                <div className="mb-3 text-sm font-bold text-white">{t.header.settings}</div>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-white/80">{t.header.sound}</span>
                    <button
                      type="button"
                      onClick={() => setSoundOn(!soundOn)}
                      className={`relative h-5 w-10 rounded-full transition-colors ${soundOn ? 'bg-emerald-500' : 'bg-gray-600'}`}
                      aria-pressed={soundOn}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${soundOn ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-white/80">{t.header.edgeOffset}</span>
                    <div className="flex gap-1">
                      {BOTTOM_OFFSET_OPTIONS.map((offset, index) => (
                        <button
                          key={offset}
                          type="button"
                          onClick={() => setBottomOffsetIndex(index)}
                          className={`btn-cartoon flex-1 py-1 text-[10px] ${
                            index === bottomOffsetIndex
                              ? 'border-yellow-700 bg-yellow-500 text-black'
                              : 'border-gray-800 bg-gray-700 text-white/60'
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
                  className="btn-cartoon mt-3 w-full border-gray-800 bg-gray-700 py-1.5 text-xs text-white/70 hover:bg-gray-600"
                >
                  {t.common.close}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: only language + menu stay in the bar; room, spectate and exit
          live in the menu so the row never overflows a 360-390px screen. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 sm:hidden">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="max-w-full truncate text-[11px] font-semibold text-white/75">
            {t.header.leader}: <span className="text-white">{leaderName}</span>
          </span>
          {isSpectator ? (
            <span className="rounded-full border border-sky-400/25 bg-sky-500/12 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-100">
              {t.header.spectating}
            </span>
          ) : (
            <span className="text-sm font-bold text-emerald-200">{formatCurrency(balance)}</span>
          )}
        </div>

        {!isSpectator && (
          <div className="flex-shrink-0">
            <AutoplayPanel config={autoplay} onChange={onAutoplayChange} />
          </div>
        )}

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <LanguageToggle
            language={language}
            onToggle={toggleLanguage}
            className="min-h-10 border-white/12 bg-white/6 px-2.5 py-1 text-[11px] hover:bg-white/12"
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="btn-cartoon min-h-10 border-white/12 bg-white/6 px-3 py-1 text-xs text-white/90 hover:bg-white/12"
              title={t.header.settings}
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
            >
              {t.header.settings}
            </button>
            {settingsOpen && (
              <div className="panel-surface absolute top-full right-0 z-[70] mt-2 w-[min(260px,calc(100vw-24px))] animate-bounce-in p-3">
                <div className="mb-2 text-sm font-bold text-white">{t.header.settings}</div>
                <div className="space-y-2">
                  {roomCode && (
                    <button
                      type="button"
                      onClick={onCopyLink}
                      className="btn-cartoon min-h-10 w-full border-white/12 bg-white/6 px-3 text-xs text-white/90 hover:bg-white/12"
                      title="Copy invite link"
                    >
                      {copied ? t.header.copied : `${t.header.room} ${roomCode}`}
                    </button>
                  )}
                  <label className="flex min-h-10 items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-white/85">{t.header.sound}</span>
                    <button
                      type="button"
                      onClick={() => setSoundOn(!soundOn)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${soundOn ? 'bg-emerald-500' : 'bg-gray-600'}`}
                      aria-pressed={soundOn}
                      aria-label={t.header.sound}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${soundOn ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-white/85">{t.header.edgeOffset}</span>
                    <div className="grid grid-cols-3 gap-1">
                      {BOTTOM_OFFSET_OPTIONS.map((offset, index) => (
                        <button
                          key={offset}
                          type="button"
                          onClick={() => setBottomOffsetIndex(index)}
                          className={`btn-cartoon min-h-9 py-1 text-[11px] ${
                            index === bottomOffsetIndex
                              ? 'border-yellow-700 bg-yellow-500 text-black'
                              : 'border-gray-800 bg-gray-700 text-white/75'
                          }`}
                        >
                          {bottomOffsetLabels[index]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {!isSpectator && (
                      <button
                        type="button"
                        onClick={() => { setSettingsOpen(false); onSwitchToSpectator(); }}
                        className="btn-cartoon min-h-10 border-indigo-900 bg-indigo-700/85 px-2 text-xs text-indigo-50"
                        title="Switch to spectating"
                      >
                        {t.header.spectate}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setSettingsOpen(false); onExitRoom(); }}
                      className={`btn-cartoon min-h-10 border-rose-950 bg-rose-800/90 px-2 text-xs text-rose-100 ${isSpectator ? 'col-span-2' : ''}`}
                      title="Leave room"
                    >
                      {t.header.exit}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="btn-cartoon mt-2 min-h-9 w-full border-gray-800 bg-gray-700 py-1 text-xs text-white/75"
                >
                  {t.common.close}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

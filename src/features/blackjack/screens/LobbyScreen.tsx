'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import LanguageToggle from '@/features/blackjack/components/LanguageToggle';
import type { RoomSettings } from '@/features/blackjack/lib/blackjack';
import EntryButton from '@/features/blackjack/components/entry/EntryButton';
import EntryInput from '@/features/blackjack/components/entry/EntryInput';
import EntryToggle from '@/features/blackjack/components/entry/EntryToggle';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

type EntryMode = 'idle' | 'join';

export interface LobbyScreenProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  inputRoomCode: string;
  setInputRoomCode: (code: string) => void;
  error: string;
  balance: number;
  roomSettings: RoomSettings;
  setRoomSettings: Dispatch<SetStateAction<RoomSettings>>;
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (spectator?: boolean) => Promise<void>;
  onPlaySolo: () => Promise<void>;
}

export default function LobbyScreen({
  playerName,
  setPlayerName,
  inputRoomCode,
  setInputRoomCode,
  error,
  balance,
  roomSettings,
  setRoomSettings,
  onCreateRoom,
  onJoinRoom,
  onPlaySolo,
}: LobbyScreenProps) {
  const [mode, setMode] = useState<EntryMode>(inputRoomCode.trim() ? 'join' : 'idle');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const roomCodeInputRef = useRef<HTMLInputElement>(null);
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode !== 'join') return;
    if (!inputRoomCode.trim()) {
      roomCodeInputRef.current?.focus();
    }
  }, [inputRoomCode, mode]);

  const nameError = useMemo(() => {
    if (!error) return '';
    if (/name/i.test(error) || mode === 'idle') return error;
    return '';
  }, [error, mode]);

  const joinError = useMemo(() => {
    if (!error || /name/i.test(error) || mode !== 'join') return '';
    return error;
  }, [error, mode]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onPlaySolo();
  };

  const handleSpectator = () => {
    if (!inputRoomCode.trim()) {
      setMode('join');
      return;
    }

    void onJoinRoom(true);
  };

  const toggleLanguage = () => setLanguage(language === 'en' ? 'es' : 'en');

  return (
    <main className="entry-screen">
      <form className="entry-column" onSubmit={handleSubmit}>
        <div className="entry-toolbar">
          <LanguageToggle
            language={language}
            onToggle={toggleLanguage}
            className="entry-language-toggle"
          />
        </div>

        <header className="entry-title">
          <div className="entry-logo" aria-hidden="true">
            <span className="entry-logo__mark">BJ</span>
          </div>
          <h1 className="entry-title__text">Blackjack</h1>
        </header>

        <div className="entry-field">
          <EntryInput
            ref={nameInputRef}
            type="text"
            placeholder={t.common.playerName}
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value.slice(0, 20))}
            autoComplete="nickname"
            autoFocus
            invalid={Boolean(nameError)}
            maxLength={20}
            aria-label={t.common.playerName}
          />
          {nameError && (
            <p className="entry-error" role="status" aria-live="polite">
              {nameError}
            </p>
          )}
        </div>

        <EntryButton type="submit" variant="primary">
          {t.lobby.playSolo}
        </EntryButton>

        <div className="entry-divider" aria-hidden="true">
          <span>{t.lobby.or}</span>
        </div>

        <EntryButton type="button" variant="secondary" onClick={() => void onCreateRoom()}>
          {t.lobby.createRoom}
        </EntryButton>

        <section className="entry-join">
          {mode === 'idle' && (
            <EntryButton type="button" variant="secondary" onClick={() => setMode('join')}>
              {t.lobby.joinRoom}
            </EntryButton>
          )}

          <div className={`entry-join__reveal${mode === 'join' ? ' is-visible' : ''}`}>
            <div className="entry-join__content">
              <EntryInput
                ref={roomCodeInputRef}
                type="text"
                placeholder={t.common.roomCode}
                value={inputRoomCode}
                onChange={(event) => setInputRoomCode(event.target.value.replace(/\s+/g, '').toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                invalid={Boolean(joinError)}
                maxLength={6}
                aria-label={t.common.roomCode}
              />
              <EntryButton type="button" variant="secondary" onClick={() => void onJoinRoom(false)}>
                {t.lobby.joinRoom}
              </EntryButton>
              {joinError && (
                <p className="entry-error" role="status" aria-live="polite">
                  {joinError}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="entry-spectator">
          <EntryButton type="button" variant="text" onClick={handleSpectator}>
            {t.lobby.joinSpectator}
          </EntryButton>
        </div>

        <div className="entry-toggle-row">
          <EntryToggle
            label={t.lobby.insuranceRule}
            checked={roomSettings.insuranceEnabled}
            onChange={() =>
              setRoomSettings((current) => ({
                ...current,
                insuranceEnabled: !current.insuranceEnabled,
              }))
            }
          />
          <EntryToggle
            label={t.lobby.surrenderRule}
            checked={roomSettings.surrenderEnabled}
            onChange={() =>
              setRoomSettings((current) => ({
                ...current,
                surrenderEnabled: !current.surrenderEnabled,
              }))
            }
          />
        </div>

        <p className="entry-balance">{t.common.balance}: {formatCurrency(balance)}</p>
      </form>
    </main>
  );
}

'use client';

import { useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { RoomSettings } from '@/features/blackjack/lib/blackjack';
import type { EntryAction, RoomError } from '@/features/blackjack/lib/entry';
import { ROOM_CODE_PATTERN, sanitizePlayerName } from '@/features/blackjack/lib/validation';
import EntryShell from '@/features/blackjack/components/entry/EntryShell';
import EntryButton from '@/features/blackjack/components/entry/EntryButton';
import EntryInput from '@/features/blackjack/components/entry/EntryInput';
import { useLanguage } from '@/shared/i18n/useLanguage';

export interface LobbyScreenProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  inputRoomCode: string;
  setInputRoomCode: (code: string) => void;
  error: RoomError | null;
  clearError: () => void;
  pendingAction: EntryAction | null;
  onCancelEntry: () => void;
  balance: number;
  roomSettings: RoomSettings;
  setRoomSettings: Dispatch<SetStateAction<RoomSettings>>;
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (spectator?: boolean) => Promise<void>;
  onPlaySolo: () => Promise<void>;
}

export default function LobbyScreen({
  playerName, setPlayerName, inputRoomCode, setInputRoomCode, error, clearError,
  pendingAction, onCancelEntry, balance, roomSettings, setRoomSettings, onCreateRoom, onJoinRoom, onPlaySolo,
}: LobbyScreenProps) {
  const [choice, setChoice] = useState<EntryAction | null>(null);
  const [spectator, setSpectator] = useState(false);
  const [fieldError, setFieldError] = useState<RoomError | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const { t, language } = useLanguage();
  // Invitations arrive after the stable server render and override the solo default.
  const action = choice ?? (inputRoomCode ? 'join' : 'solo');
  const busy = pendingAction !== null;
  const activeError = fieldError ?? error;
  const errorText = activeError ? t.entry.errors[activeError.code] : '';
  const resetErrors = () => { setFieldError(null); clearError(); };
  const select = (next: EntryAction) => { if (!busy) { setChoice(next); resetErrors(); } };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || submitting.current) return;
    resetErrors();
    if (!sanitizePlayerName(playerName)) {
      setFieldError({ field: 'name', code: 'nameRequired' }); nameRef.current?.focus(); return;
    }
    if (action === 'join' && !ROOM_CODE_PATTERN.test(inputRoomCode.trim().toUpperCase())) {
      setFieldError({ field: 'roomCode', code: 'invalidRoomCode' }); codeRef.current?.focus(); return;
    }
    submitting.current = true;
    try {
      if (action === 'solo') await onPlaySolo();
      else if (action === 'create') await onCreateRoom();
      else await onJoinRoom(spectator);
    } finally { submitting.current = false; }
  };

  const submitText = pendingAction === 'solo' ? t.entry.soloPending
    : pendingAction === 'create' ? t.entry.createPending : pendingAction === 'join' ? t.entry.joinPending
    : action === 'solo' ? t.lobby.playSolo : action === 'create' ? t.lobby.createRoom
    : spectator ? t.lobby.joinSpectator : t.lobby.joinRoom;

  return (
    <EntryShell>
      <h2 className="entry-heading">{t.entry.title}</h2>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={busy}>
        <fieldset className="entry-fields" disabled={busy}>
          <div className="entry-field">
            <label htmlFor="entry-name">{t.common.playerName}</label>
            <EntryInput id="entry-name" name="nickname" ref={nameRef} value={playerName} maxLength={20} required autoComplete="nickname"
              placeholder={t.entry.namePlaceholder} invalid={activeError?.field === 'name'} aria-describedby={activeError?.field === 'name' ? 'entry-name-error' : undefined}
              onChange={(event) => { setPlayerName(event.target.value); resetErrors(); }} />
            {activeError?.field === 'name' && <p id="entry-name-error" className="entry-error" role="alert">{errorText}</p>}
          </div>
          <div className="entry-modes" role="group" aria-label={t.entry.title}>
            <button type="button" aria-pressed={action === 'solo'} onClick={() => select('solo')}>{t.lobby.playSolo}</button>
            <button type="button" aria-pressed={action !== 'solo'} onClick={() => select(inputRoomCode ? 'join' : 'create')}>{t.entry.friends}</button>
          </div>
          {action !== 'solo' && (
            <div className="entry-room-modes" role="group" aria-label={t.common.roomCode}>
              <button type="button" aria-pressed={action === 'create'} onClick={() => select('create')}>{t.lobby.createRoom}</button>
              <button type="button" aria-pressed={action === 'join'} onClick={() => select('join')}>{t.entry.haveCode}</button>
            </div>
          )}
          {action === 'join' && (
            <div className="entry-join-fields">
              <div className="entry-field">
                <label htmlFor="entry-code">{t.common.roomCode}</label>
                <EntryInput id="entry-code" name="roomCode" className="entry-code-input" ref={codeRef} value={inputRoomCode}
                  required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABC123"
                  invalid={activeError?.field === 'roomCode'} aria-describedby={`entry-code-hint${activeError?.field === 'roomCode' ? ' entry-code-error' : ''}`}
                  onChange={(event) => { setInputRoomCode(event.target.value.replace(/\s+/g, '').toUpperCase()); resetErrors(); }} />
                <p id="entry-code-hint" className="entry-hint">{t.entry.codeHint}</p>
                {activeError?.field === 'roomCode' && <p id="entry-code-error" className="entry-error" role="alert">{errorText}</p>}
              </div>
              <label className="entry-checkbox"><input type="checkbox" checked={spectator} onChange={(event) => setSpectator(event.target.checked)} />{t.entry.observe}</label>
            </div>
          )}
          {action !== 'join' && (
            <details className="entry-rules">
              <summary>{t.entry.rules}</summary>
              <label className="entry-checkbox"><input type="checkbox" checked={roomSettings.insuranceEnabled}
                onChange={(event) => setRoomSettings((current) => ({ ...current, insuranceEnabled: event.target.checked }))} />{t.lobby.insuranceRule}</label>
              <p className="entry-hint">{t.entry.insuranceHint}</p>
              <label className="entry-checkbox"><input type="checkbox" checked={roomSettings.surrenderEnabled}
                onChange={(event) => setRoomSettings((current) => ({ ...current, surrenderEnabled: event.target.checked }))} />{t.entry.surrender}</label>
              <p className="entry-hint">{t.entry.surrenderHint}</p>
            </details>
          )}
          <EntryButton type="submit" variant="primary">{submitText}</EntryButton>
        </fieldset>
        {activeError?.field === 'connection' && <p className="entry-error entry-feedback" role="alert">{errorText}</p>}
        {busy && <div className="entry-feedback"><p className="entry-hint" role="status">{submitText}</p><EntryButton variant="text" onClick={onCancelEntry}>{t.entry.cancel}</EntryButton></div>}
        <p className="entry-balance"><span>{t.common.balance}</span><strong>{new Intl.NumberFormat(language).format(balance)} {t.entry.chips}</strong></p>
      </form>
    </EntryShell>
  );
}

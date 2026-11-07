'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  SetStateAction,
} from 'react';
import LanguageToggle from '@/features/blackjack/components/LanguageToggle';
import EntryButton from '@/features/blackjack/components/entry/EntryButton';
import EntryInput from '@/features/blackjack/components/entry/EntryInput';
import EntryToggle from '@/features/blackjack/components/entry/EntryToggle';
import type { RoomSettings } from '@/features/blackjack/lib/blackjack';
import { MAX_PLAYER_NAME_LENGTH } from '@/features/blackjack/lib/validation';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

// Props contract is unchanged: GameRoom.tsx keeps passing exactly the same values.
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

type Tab = 'new' | 'join';
type PendingAction = 'solo' | 'create' | 'join' | 'spectate';
type ErrorKind = 'name' | 'code' | 'join' | 'create' | 'other';

/** p2p.ts generates 6-char codes; ROOM_CODE_PATTERN accepts 4–8 but the UI targets 6. */
const ROOM_CODE_LENGTH = 6;
/** After this long without a resolution we tell the user the connection is slow. */
const SLOW_CONNECTION_MS = 8000;

/** Accepts a raw code, a code with spaces/dashes, or a full invite URL (?room=CODE). */
export function sanitizeRoomCode(raw: string): string {
  const fromUrl = raw.match(/[?&]room=([^&#\s]+)/i);
  return (fromUrl ? fromUrl[1] : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

/** The hook (useRoomConnection) emits English-only strings; classify them so we can
 *  show localized copy next to the field that caused them. */
function classifyError(error: string): ErrorKind | null {
  if (!error) return null;
  if (/enter your name/i.test(error)) return 'name';
  if (/enter room code/i.test(error)) return 'code';
  if (/^failed to join/i.test(error)) return 'join';
  if (/^failed to create/i.test(error)) return 'create';
  return 'other';
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

const noopSubscribe = () => () => {};

/** false during SSR and hydration, true afterwards. useRoomConnection seeds playerName and
 *  inputRoomCode from localStorage / location.search inside useState, so the server HTML
 *  can never match the client; rendering a shell first avoids the hydration mismatch. */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function Spinner() {
  return <span className="lspinner" aria-hidden="true" />;
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
  const { t, language, setLanguage } = useLanguage();
  const l = t.lobby;
  const isClient = useIsClient();
  const ids = useId();

  // Deep link: useRoomConnection pre-fills inputRoomCode from ?room=CODE on first render,
  // so a non-empty initial code means "the user arrived through an invite link".
  const [inviteCode] = useState(() => inputRoomCode.trim());
  const isInvite = Boolean(inviteCode);
  // Nickname persistence already lives in useRoomConnection (localStorage 'bj_player_name').
  const [wasRemembered, setWasRemembered] = useState(() => Boolean(playerName.trim()));
  const [tab, setTab] = useState<Tab>(() => (inputRoomCode.trim() ? 'join' : 'new'));
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const [localError, setLocalError] = useState<ErrorKind | null>(null);
  // We cannot clear the hook's `error` (no setter in the contract), so we hide it
  // once the user edits the offending field.
  const [dismissedError, setDismissedError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = pending !== null;
  const code = inputRoomCode;
  const codeComplete = code.length === ROOM_CODE_LENGTH;
  const hookError = error && error !== dismissedError ? classifyError(error) : null;
  const errorKind: ErrorKind | null = busy ? null : localError ?? hookError;
  const initial = Array.from(playerName.trim())[0]?.toUpperCase() ?? '?';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  // Initial focus: never pop the keyboard if the user can act with one tap.
  useEffect(() => {
    if (!isClient) return;
    if (!playerName.trim()) nameRef.current?.focus();
    else if (tab === 'join' && !codeComplete) codeRef.current?.focus();
    else if (isInvite) document.getElementById(`${ids}-primary-${tab}`)?.focus();
    // run once, when the real UI first mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  // Move focus to the field that needs attention whenever a new error lands.
  useEffect(() => {
    if (errorKind === 'name') nameRef.current?.focus();
    // code/join errors can only originate from the join tab, so no tab switch is needed.
    if (errorKind === 'code' || errorKind === 'join') codeRef.current?.focus();
  }, [errorKind]);

  const run = async (action: PendingAction, fn: () => Promise<void>) => {
    if (busy) return;
    setLocalError(null);
    setDismissedError('');
    setPending(action);
    setIsSlow(false);
    slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_CONNECTION_MS);
    try {
      await fn();
    } finally {
      // On success GameRoom swaps screens and this component unmounts.
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (mountedRef.current) {
        setPending(null);
        setIsSlow(false);
      }
    }
  };

  const requireName = () => {
    if (playerName.trim()) return true;
    setLocalError('name');
    nameRef.current?.focus();
    return false;
  };

  const requireCode = () => {
    if (codeComplete) return true;
    setLocalError('code');
    codeRef.current?.focus();
    return false;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireName()) return;
    if (tab === 'new') {
      void run('solo', onPlaySolo);
      return;
    }
    if (!requireCode()) return;
    void run('join', () => onJoinRoom(false));
  };

  const handleCreate = () => {
    if (!requireName()) return;
    void run('create', onCreateRoom);
  };

  const handleSpectate = () => {
    if (!requireName() || !requireCode()) return;
    void run('spectate', () => onJoinRoom(true));
  };

  const handleNameChange = (value: string) => {
    setPlayerName(value.slice(0, MAX_PLAYER_NAME_LENGTH));
    setWasRemembered(false);
    if (localError === 'name') setLocalError(null);
    if (hookError === 'name') setDismissedError(error);
  };

  const handleCodeChange = (value: string) => {
    setInputRoomCode(sanitizeRoomCode(value));
    if (localError === 'code') setLocalError(null);
    if (hookError === 'code' || hookError === 'join') setDismissedError(error);
  };

  const handleCodePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    // Paste replaces the whole value so a full invite URL becomes just its code.
    event.preventDefault();
    handleCodeChange(event.clipboardData.getData('text'));
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: Tab =
      event.key === 'Home' ? 'new' : event.key === 'End' ? 'join' : tab === 'new' ? 'join' : 'new';
    setTab(next);
    document.getElementById(`${ids}-tab-${next}`)?.focus();
  };

  const toggleLanguage = () => setLanguage(language === 'en' ? 'es' : 'en');

  const label = (action: PendingAction, idle: ReactNode) =>
    pending === action ? (
      <>
        <Spinner />
        {l.connecting}
      </>
    ) : (
      idle
    );

  const nameMessageId = `${ids}-name-msg`;
  const codeMessageId = `${ids}-code-msg`;

  const statusText =
    pending === 'join' || pending === 'spectate'
      ? isSlow
        ? l.slowConnection
        : fill(l.connectingTo, { code })
      : pending === 'create'
        ? isSlow
          ? l.slowConnection
          : l.creatingRoom
        : '';

  const alert =
    errorKind === 'join' || errorKind === 'create' || errorKind === 'other' ? (
      <div className="lalert" role="alert">
        <span className="lalert__icon" aria-hidden="true">!</span>
        <span>
          <span className="lalert__title">
            {errorKind === 'create' ? l.errors.createFailedTitle : l.errors.joinFailedTitle}
          </span>
          {errorKind === 'join' && fill(l.errors.joinFailed, { code })}
          {errorKind === 'create' && l.errors.createFailed}
          {errorKind === 'other' && l.errors.generic}
        </span>
      </div>
    ) : null;

  if (!isClient) {
    // Same felt background, no content: avoids SSR/client text mismatches.
    return <main className="lobby" aria-busy="true" />;
  }

  return (
    <main className="lobby" data-compact={tab === 'join'}>
      <div className="lobby__shell">
        <header className="lobby__top">
          <span className="lobby__brand">
            <span className="lobby__chip" aria-hidden="true">BJ</span>
            {t.header.title}
          </span>
          <LanguageToggle
            language={language}
            onToggle={toggleLanguage}
            className="entry-language-toggle"
          />
        </header>

        <div className="lobby__body">
          <section className="lobby__hero" aria-labelledby={`${ids}-title`}>
            <div className="lobby__cards" aria-hidden="true">
              <div className="pcard pcard--a">
                <span className="pcard__corner">A<span>♠</span></span>
                <span className="pcard__pip">♠</span>
              </div>
              <div className="pcard pcard--k">
                <span className="pcard__corner">K<span>♥</span></span>
                <span className="pcard__pip">♥</span>
              </div>
            </div>
            <h1 className="lobby__title" id={`${ids}-title`}>Blackjack</h1>
            <p className="lobby__tagline">{l.tagline}</p>
            <ul className="lobby__payouts">
              <li>{t.table.blackjackPays}</li>
              <li>{t.table.dealerStands}</li>
            </ul>
          </section>

          <form className="lobby__panel" onSubmit={handleSubmit} noValidate aria-busy={busy}>
            {isInvite && (
              <p className="lobby__invite">
                <span className="lobby__invite-icon" aria-hidden="true">♣</span>
                <span>
                  {l.invitedTo} <strong>{inviteCode}</strong>
                </span>
              </p>
            )}

            {/* ---- Nickname ---- */}
            <div className="lfield">
              <label className="lfield__label" htmlFor={`${ids}-name`}>
                <span>{l.nicknameLabel}</span>
                <span className="lfield__count" aria-hidden="true">
                  {playerName.length}/{MAX_PLAYER_NAME_LENGTH}
                </span>
              </label>
              <div className="lfield__control">
                <span className="lfield__avatar" aria-hidden="true">{initial}</span>
                <EntryInput
                  ref={nameRef}
                  id={`${ids}-name`}
                  type="text"
                  value={playerName}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder={l.nicknamePlaceholder}
                  maxLength={MAX_PLAYER_NAME_LENGTH}
                  autoComplete="nickname"
                  autoCapitalize="words"
                  enterKeyHint="go"
                  disabled={busy}
                  invalid={errorKind === 'name'}
                  aria-invalid={errorKind === 'name'}
                  aria-describedby={nameMessageId}
                />
              </div>
              {errorKind === 'name' ? (
                <p className="lfield__error" id={nameMessageId} role="alert">
                  <span aria-hidden="true">!</span>
                  {l.errors.nameRequired}
                </p>
              ) : (
                <p className="lfield__hint" id={nameMessageId}>
                  {wasRemembered
                    ? `${fill(l.welcomeBack, { name: playerName.trim() })} · ${l.savedOnDevice}`
                    : l.nicknameRemembered}
                </p>
              )}
            </div>

            {/* ---- Create vs Join ---- */}
            <div className="lseg" role="tablist" aria-label={l.modeLabel}>
              {(['new', 'join'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`${ids}-tab-${value}`}
                  aria-controls={`${ids}-panel-${value}`}
                  aria-selected={tab === value}
                  tabIndex={tab === value ? 0 : -1}
                  className="lseg__tab"
                  onClick={() => setTab(value)}
                  onKeyDown={handleTabKeyDown}
                  disabled={busy}
                >
                  {value === 'new' ? l.tabNewTable : l.tabJoin}
                </button>
              ))}
            </div>

            {/* New table: solo (primary/submit) or private room (secondary) */}
            <div
              className="lpanel"
              role="tabpanel"
              id={`${ids}-panel-new`}
              aria-labelledby={`${ids}-tab-new`}
              hidden={tab !== 'new'}
            >
              <fieldset className="lrules" disabled={busy}>
                <legend>{l.houseRules}</legend>
                <div className="lrules__row">
                  <EntryToggle
                    label={l.insuranceRule}
                    checked={roomSettings.insuranceEnabled}
                    onChange={() =>
                      setRoomSettings((current) => ({ ...current, insuranceEnabled: !current.insuranceEnabled }))
                    }
                  />
                  <EntryToggle
                    label={l.surrenderRule}
                    checked={roomSettings.surrenderEnabled}
                    onChange={() =>
                      setRoomSettings((current) => ({ ...current, surrenderEnabled: !current.surrenderEnabled }))
                    }
                  />
                </div>
              </fieldset>

              {tab === 'new' && alert}

              <div className="lactions">
                <EntryButton
                  id={`${ids}-primary-new`}
                  type="submit"
                  variant="primary"
                  disabled={busy}
                  aria-busy={pending === 'solo'}
                >
                  {label('solo', l.playSolo)}
                </EntryButton>
                <EntryButton
                  type="button"
                  variant="secondary"
                  onClick={handleCreate}
                  disabled={busy}
                  aria-busy={pending === 'create'}
                  aria-describedby={`${ids}-create-sub`}
                >
                  <span className="lbtn__main">{label('create', l.createRoom)}</span>
                  <span className="lbtn__sub" id={`${ids}-create-sub`}>{l.createRoomHint}</span>
                </EntryButton>
              </div>
            </div>

            {/* Join with code */}
            <div
              className="lpanel"
              role="tabpanel"
              id={`${ids}-panel-join`}
              aria-labelledby={`${ids}-tab-join`}
              hidden={tab !== 'join'}
            >
              <div className="lfield">
                <label className="lfield__label" htmlFor={`${ids}-code`}>
                  <span>{t.common.roomCode}</span>
                  <span className="lfield__count" aria-hidden="true">
                    {code.length}/{ROOM_CODE_LENGTH}
                  </span>
                </label>
                <EntryInput
                  ref={codeRef}
                  id={`${ids}-code`}
                  type="text"
                  className="lobby__code"
                  value={code}
                  onChange={(event) => handleCodeChange(event.target.value)}
                  onPaste={handleCodePaste}
                  placeholder="ABC123"
                  // No maxLength: it would truncate a pasted invite URL before we can parse it.
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  disabled={busy}
                  invalid={errorKind === 'code' || errorKind === 'join'}
                  aria-invalid={errorKind === 'code' || errorKind === 'join'}
                  aria-describedby={codeMessageId}
                />
                {errorKind === 'code' ? (
                  <p className="lfield__error" id={codeMessageId} role="alert">
                    <span aria-hidden="true">!</span>
                    {code ? l.errors.codeIncomplete : l.errors.codeRequired}
                  </p>
                ) : (
                  <p className="lfield__hint" id={codeMessageId} hidden={errorKind === 'join'}>
                    {l.roomCodeHint}
                  </p>
                )}
              </div>

              {tab === 'join' && alert}

              <div className="lactions">
                <EntryButton
                  id={`${ids}-primary-join`}
                  type="submit"
                  variant="primary"
                  disabled={busy}
                  // aria-disabled keeps it focusable/clickable so pressing it explains what's missing
                  aria-disabled={!codeComplete || undefined}
                  aria-busy={pending === 'join'}
                >
                  {label('join', codeComplete ? fill(l.joinCode, { code }) : l.joinTable)}
                </EntryButton>
                <EntryButton
                  type="button"
                  variant="text"
                  onClick={handleSpectate}
                  disabled={busy}
                  aria-busy={pending === 'spectate'}
                >
                  {label('spectate', l.watchAsSpectator)}
                </EntryButton>
              </div>
            </div>

            <p className="lstatus" role="status" aria-live="polite">
              {statusText}
            </p>

            <p className="lobby__foot">
              <span>
                {t.common.balance} <b>{formatCurrency(balance)}</b>
              </span>
              <span aria-hidden="true">·</span>
              <span>{l.p2pNote}</span>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}

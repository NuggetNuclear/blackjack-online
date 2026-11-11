'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '@/features/blackjack/lib/blackjack';
import EntryButton from '@/features/blackjack/components/entry/EntryButton';
import EntryShell from '@/features/blackjack/components/entry/EntryShell';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface WaitingRoomScreenProps {
  roomCode: string;
  gameState: GameState;
  isHost: boolean;
  isSpectator: boolean;
  onStartGame: () => void;
  onExitRoom: () => void;
}

export default function WaitingRoomScreen({ roomCode, gameState, isHost, isSpectator, onStartGame, onExitRoom }: WaitingRoomScreenProps) {
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const players = useMemo(() => Object.values(gameState.players).sort((left, right) =>
    left.id === gameState.hostId ? -1 : right.id === gameState.hostId ? 1 : left.name.localeCompare(right.name)
  ), [gameState.hostId, gameState.players]);

  useEffect(() => {
    if (feedback !== 'copied') return;
    const timeout = window.setTimeout(() => setFeedback(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const copy = async (kind: 'code' | 'link') => {
    const link = new URL(window.location.pathname, window.location.origin);
    link.searchParams.set('room', roomCode);
    try {
      await navigator.clipboard.writeText(kind === 'code' ? roomCode : link.href);
      setFeedback('copied');
    } catch {
      setInviteLink(link.href);
      setFeedback('failed');
    }
  };

  return (
    <EntryShell>
      <h2 className="entry-heading">{t.common.roomCode}</h2>
      <p className="entry-room-code" aria-label={t.common.roomCode}>{roomCode}</p>
      <div className="entry-copy-actions">
        <EntryButton onClick={() => void copy('link')}>{t.entry.copyLink}</EntryButton>
        <EntryButton onClick={() => void copy('code')}>{t.entry.copyCode}</EntryButton>
      </div>
      <div className="entry-feedback" role="status" aria-live="polite">
        {feedback === 'copied' && <p className="entry-hint">{t.entry.copied}</p>}
        {feedback === 'failed' && <><p className="entry-error">{t.entry.copyFailed}</p><label className="entry-field">{t.entry.inviteLink}<input className="entry-input" readOnly value={inviteLink} onFocus={(event) => event.target.select()} /></label></>}
      </div>
      <p className="entry-hint">{isHost ? t.entry.hostPrompt : isSpectator ? t.entry.spectatorPrompt : t.entry.guestPrompt}</p>
      <section className="entry-players" aria-label={t.waiting.players}>
        <h3>{t.waiting.players}</h3>
        <ul className="entry-list">
          {players.map((player) => <li key={player.id}><span>{player.name}</span>{player.id === gameState.hostId && <span className="entry-badge">{t.waiting.leaderBadge}</span>}</li>)}
        </ul>
      </section>
      <div className="entry-actions">
        {isHost && <EntryButton variant="primary" onClick={onStartGame}>{t.entry.openTable}</EntryButton>}
        <EntryButton onClick={onExitRoom}>{t.entry.leave}</EntryButton>
      </div>
    </EntryShell>
  );
}

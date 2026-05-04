'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '@/features/blackjack/lib/blackjack';
import EntryButton from '@/features/blackjack/components/entry/EntryButton';

type CopyChoice = 'link' | 'code';

interface WaitingRoomScreenProps {
  roomCode: string;
  gameState: GameState;
  isHost: boolean;
  onStartGame: () => void;
  onExitRoom: () => void;
}

export default function WaitingRoomScreen({
  roomCode,
  gameState,
  isHost,
  onStartGame,
  onExitRoom,
}: WaitingRoomScreenProps) {
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string>('');
  const players = useMemo(
    () =>
      Object.values(gameState.players).sort((left, right) => {
        if (left.id === gameState.hostId) return -1;
        if (right.id === gameState.hostId) return 1;
        return left.name.localeCompare(right.name);
      }),
    [gameState.hostId, gameState.players]
  );

  useEffect(() => {
    if (!copyFeedback) return;

    const timeout = window.setTimeout(() => {
      setCopyFeedback('');
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  const handleCopy = async (choice: CopyChoice) => {
    const value = choice === 'link'
      ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
      : roomCode;

    await navigator.clipboard.writeText(value);
    setCopyFeedback(choice === 'link' ? 'Link copied' : 'Code copied');
    setCopyMenuOpen(false);
  };

  return (
    <main className="entry-screen">
      <section className="entry-column">
        <header className="entry-room">
          <p className="entry-room__label">Room Code</p>
          <button
            type="button"
            className="entry-room__trigger"
            onClick={() => setCopyMenuOpen((open) => !open)}
            aria-expanded={copyMenuOpen}
            aria-haspopup="menu"
          >
            {roomCode}
          </button>
          {copyMenuOpen && (
            <div className="entry-copy-actions" role="menu" aria-label="Copy room details">
              <button type="button" className="entry-copy-button" onClick={() => void handleCopy('link')} role="menuitem">
                Copy Link
              </button>
              <button type="button" className="entry-copy-button" onClick={() => void handleCopy('code')} role="menuitem">
                Copy Code
              </button>
            </div>
          )}
          {copyFeedback && <p className="entry-copy-feedback">{copyFeedback}</p>}
        </header>

        <section className="entry-list-block" aria-label="Player list">
          <p className="entry-room__label">Players</p>
          <ul className="entry-list">
            {players.map((player) => (
              <li key={player.id} className="entry-list__item">
                <span className="entry-list__name">{player.name}</span>
                {player.id === gameState.hostId && <span className="entry-badge">Host</span>}
              </li>
            ))}
          </ul>
        </section>

        <div className="entry-actions">
          {isHost && (
            <EntryButton type="button" variant="primary" onClick={onStartGame}>
              Start Game
            </EntryButton>
          )}

          <EntryButton type="button" variant="secondary" onClick={onExitRoom}>
            Leave
          </EntryButton>
        </div>
      </section>
    </main>
  );
}

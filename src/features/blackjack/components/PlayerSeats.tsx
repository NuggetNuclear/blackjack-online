'use client';

import { memo, useMemo } from 'react';
import { GameState, PlayerState } from '@/features/blackjack/lib/blackjack';
import HandDisplay from '@/features/blackjack/components/HandDisplay';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

/** Returns true if this hand is still actionable (not resolved). */
function isHandActionable(hand: { stood: boolean; busted: boolean; blackjack: boolean; surrendered: boolean }): boolean {
  return !hand.stood && !hand.busted && !hand.blackjack && !hand.surrendered;
}

interface PlayerSeatsProps {
  gameState: GameState;
  myId: string;
  seatLift: number;
  currentBet?: number;
}

function SeatContent({
  player,
  isMe,
  gameState,
  currentBet,
  compact = false,
}: {
  player: PlayerState;
  isMe: boolean;
  gameState: GameState;
  currentBet?: number;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const joiningNextRound = gameState.phase !== 'betting' && player.hands.every((hand) => hand.cards.length === 0);
  const isSplit = player.hands.length > 1;

  return (
    <div className={`flex flex-col items-center ${compact ? 'rounded-2xl border border-white/12 bg-black/35 px-2.5 py-1.5 backdrop-blur-xs' : ''}`}>
      <div className={`flex flex-wrap items-end justify-center ${isSplit ? 'gap-2 sm:gap-3.5' : 'gap-2'}`}>
        {player.hands.map((hand, handIdx) => {
          const isThisHandActive = gameState.phase === 'playing' && handIdx === player.activeHandIndex && isHandActionable(hand);
          const displayHand = { ...hand };
          if (isMe && gameState.phase === 'betting' && !player.ready && handIdx === 0 && currentBet !== undefined) {
            displayHand.bet = currentBet;
          }

          return (
            <div
              key={handIdx}
              className="relative transition-all duration-200"
              style={{
                transform: isSplit && handIdx !== player.activeHandIndex ? 'scale(0.9)' : 'scale(1)',
                opacity: isSplit && handIdx !== player.activeHandIndex ? 0.78 : 1,
              }}
            >
              {isThisHandActive && (
                <div
                  className="pointer-events-none absolute -inset-2 sm:-inset-3 rounded-2xl animate-pulse z-0"
                  style={{
                    boxShadow: isMe
                      ? '0 0 22px rgba(250,204,21,0.45), inset 0 0 0 1.5px rgba(250,204,21,0.5)'
                      : '0 0 18px rgba(147,197,253,0.3)',
                  }}
                />
              )}
              <div className="relative z-10">
                <HandDisplay
                  hand={displayHand}
                  label={handIdx === 0 ? player.name : `#${handIdx + 1}`}
                  isCurrentPlayer={isMe}
                  forceSmall={compact || (isSplit && player.hands.length >= 3)}
                  result={gameState.phase === 'results' ? (displayHand.result ?? undefined) : undefined}
                  payout={gameState.phase === 'results' ? (displayHand.payout ?? undefined) : undefined}
                  showValue={gameState.phase !== 'betting'}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-[11px] font-bold tabular-nums">
        <span className="text-emerald-300/80">{formatCurrency(player.balance)}</span>
        {joiningNextRound ? (
          <span className="text-amber-300/90">{t.seats.joiningNextRound}</span>
        ) : gameState.phase === 'betting' && (
          <span className={player.ready ? 'text-green-400/90' : 'text-yellow-300/80 animate-pulse'}>
            {player.ready ? t.seats.ready : t.seats.betting}
          </span>
        )}
      </div>
    </div>
  );
}

function PlayerSeats({ gameState, myId, seatLift, currentBet }: PlayerSeatsProps) {
  const allPlayers = useMemo(() => Object.values(gameState.players), [gameState.players]);
  const myPlayer = gameState.players[myId];
  const otherPlayers = useMemo(
    () => allPlayers.filter((p) => p.id !== myId),
    [allPlayers, myId]
  );

  const seatPositions = useMemo(() => {
    const count = allPlayers.length;
    if (count === 0) return [];
    const positions: { x: number; y: number; angle: number }[] = [];
    const startAngle = -52;
    const endAngle = 52;
    const step = count > 1 ? (endAngle - startAngle) / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      const angle = count > 1 ? startAngle + step * i : 0;
      const rad = (angle * Math.PI) / 180;
      positions.push({
        x: 50 + Math.sin(rad) * 36,
        y: 42 + Math.cos(rad) * 16 - seatLift,
        angle,
      });
    }
    return positions;
  }, [allPlayers.length, seatLift]);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col justify-center">
      {/* Mobile / Compact Layout (< 768px): Dedicated peer row + centered active player */}
      <div className="flex flex-1 flex-col justify-between gap-2 px-2 py-1 md:hidden">
        {otherPlayers.length > 0 && (
          <div className="flex items-start justify-center gap-2 overflow-x-auto py-1 no-scrollbar">
            {otherPlayers.map((player) => (
              <div key={player.id} className="shrink-0">
                <SeatContent
                  player={player}
                  isMe={false}
                  gameState={gameState}
                  compact
                />
              </div>
            ))}
          </div>
        )}

        <div className="my-auto flex items-center justify-center py-1">
          {myPlayer ? (
            <SeatContent
              player={myPlayer}
              isMe
              gameState={gameState}
              currentBet={currentBet}
            />
          ) : (
            otherPlayers.length === 0 && null
          )}
        </div>
      </div>

      {/* Desktop Casino Arc Layout (>= 768px) */}
      <div className="hidden md:block absolute inset-0">
        {allPlayers.map((player, idx) => {
          const pos = seatPositions[idx];
          if (!pos) return null;
          const isMe = player.id === myId;
          return (
            <div
              key={player.id}
              className="absolute flex flex-col items-center transition-all duration-300"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: `translate(-50%, -50%) rotateY(${pos.angle * 0.1}deg)`,
                zIndex: isMe ? 30 : 20,
              }}
            >
              <SeatContent
                player={player}
                isMe={isMe}
                gameState={gameState}
                currentBet={currentBet}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(PlayerSeats);

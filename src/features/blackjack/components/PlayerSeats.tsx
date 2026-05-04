'use client';

import { useMemo } from 'react';
import { GameState } from '@/features/blackjack/lib/blackjack';
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

export default function PlayerSeats({ gameState, myId, seatLift, currentBet }: PlayerSeatsProps) {
  const { t } = useLanguage();
  const allPlayers = useMemo(() => Object.values(gameState.players), [gameState.players]);

  const seatPositions = useMemo(() => {
    const count = allPlayers.length;
    if (count === 0) return [];
    const positions: { x: number; y: number; angle: number }[] = [];
    const startAngle = -50;
    const endAngle = 50;
    const step = count > 1 ? (endAngle - startAngle) / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      const angle = count > 1 ? startAngle + step * i : 0;
      const rad = (angle * Math.PI) / 180;
      positions.push({
        x: 50 + Math.sin(rad) * 34,
        y: 44 + Math.cos(rad) * 18 - seatLift,
        angle,
      });
    }
    return positions;
  }, [allPlayers.length, seatLift]);

  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        {allPlayers.map((player, idx) => {
          const pos = seatPositions[idx];
          if (!pos) return null;
          const isMe = player.id === myId;
          const joiningNextRound = gameState.phase !== 'betting' && player.hands.every((hand) => hand.cards.length === 0);
          return (
            <div key={player.id} className="absolute flex flex-col items-center transition-all duration-300"
              style={{
                left: `${pos.x}%`, top: `${pos.y}%`,
                transform: `translate(-50%, -50%) rotateY(${pos.angle * 0.12}deg)`,
                zIndex: isMe ? 30 : 20,
              }}>

              <div className="flex flex-row gap-4 items-end justify-center">
                {player.hands.map((hand, handIdx) => {
                  const isThisHandActive = gameState.phase === 'playing' && handIdx === player.activeHandIndex && isHandActionable(hand);
                  
                  const displayHand = { ...hand };
                  if (isMe && gameState.phase === 'betting' && !player.ready && handIdx === 0 && currentBet !== undefined) {
                    displayHand.bet = currentBet;
                  }

                  return (
                    <div key={handIdx} className="relative transition-all duration-300"
                      style={{
                        transform: player.hands.length > 1 && handIdx !== player.activeHandIndex ? 'scale(0.85) translateY(10%)' : 'scale(1)',
                        opacity: player.hands.length > 1 && handIdx !== player.activeHandIndex ? 0.7 : 1
                      }}>
                      {isThisHandActive && (
                        <div className="absolute -inset-4 rounded-3xl animate-pulse z-0"
                          style={{ boxShadow: `0 0 28px ${isMe ? 'rgba(250,204,21,0.4)' : 'rgba(147,197,253,0.25)'}` }} />
                      )}
                      <div className="relative z-10">
                        {handIdx === 0 ? (
                          <HandDisplay hand={displayHand}
                            label={isMe ? `⭐ ${player.name}` : player.name}
                            isCurrentPlayer={isMe}
                            result={gameState.phase === 'results' ? (displayHand.result ?? undefined) : undefined}
                            payout={gameState.phase === 'results' ? (displayHand.payout ?? undefined) : undefined}
                            showValue={gameState.phase !== 'betting'} />
                        ) : (
                          <HandDisplay hand={displayHand}
                            isCurrentPlayer={isMe}
                            result={gameState.phase === 'results' ? (displayHand.result ?? undefined) : undefined}
                            payout={gameState.phase === 'results' ? (displayHand.payout ?? undefined) : undefined}
                            showValue={gameState.phase !== 'betting'} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <span className="mt-1 text-[11px] font-bold text-green-300/60">{formatCurrency(player.balance)}</span>
              {joiningNextRound ? (
                <span className="mt-0.5 text-[10px] font-bold text-amber-300/80">{t.seats.joiningNextRound}</span>
              ) : gameState.phase === 'betting' && (
                <span className={`text-[10px] mt-0.5 font-bold ${player.ready ? 'text-green-400/80' : 'text-yellow-400/70 animate-pulse'}`}>
                  {player.ready ? `✓ ${t.seats.ready}` : `⏳ ${t.seats.betting}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

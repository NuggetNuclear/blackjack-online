'use client';

import { GameState, PlayerState, canDoubleDown as canDD, canSplit, canSurrender as canSurrenderFn } from '@/features/blackjack/lib/blackjack';
import ActionButtons from '@/features/blackjack/components/ActionButtons';
import BettingPanel from '@/features/blackjack/components/BettingPanel';
import RoundTimerFrame from '@/features/blackjack/components/RoundTimerFrame';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface BottomControlsProps {
  gameState: GameState;
  myPlayer: PlayerState | undefined;
  isSpectator: boolean;
  isHost: boolean;
  balance: number;
  currentBet: number;
  setCurrentBet: (b: number) => void;
  autoplay: AutoplayConfig;
  autoplayRoundActive: boolean;
  bottomOffset: number;
  canAct: boolean;
  bettingSecondsLeft: number;
  bettingTimeExpired: boolean;
  bettingProgress: number;
  nextRoundProgress: number;
  nextRoundSecondsLeft: number;
  playerActionSecondsLeft: number;
  playerActionProgress: number;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onSurrender: () => void;
  onConfirmBet: () => void;
  onAllIn: () => void;
  onNewRound: () => void;
}

export default function BottomControls({
  gameState, myPlayer, isSpectator, isHost, balance,
  currentBet, setCurrentBet,
  autoplay, autoplayRoundActive, bottomOffset,
  canAct, bettingSecondsLeft, bettingTimeExpired, bettingProgress,
  nextRoundProgress, nextRoundSecondsLeft,
  playerActionSecondsLeft, playerActionProgress,
  onHit, onStand, onDouble, onSplit, onSurrender,
  onConfirmBet, onAllIn, onNewRound,
}: BottomControlsProps) {
  const { t } = useLanguage();
  const activeHand = myPlayer?.hands[myPlayer.activeHandIndex];

  return (
    <div className="relative z-30 flex flex-col items-center gap-3" style={{ marginBottom: `${20 + bottomOffset}px` }}>
      {/* Betting countdown with visual ring */}
      {gameState.phase === 'betting' && (
        <RoundTimerFrame progress={bettingProgress}>
          <div className={`rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-[0.24em] text-white shadow-xl ${
            bettingTimeExpired
              ? 'bg-red-500 border-b-[4px] border-red-700'
              : 'bg-green-500 border-b-[4px] border-green-700'
          }`}>
            {bettingTimeExpired
              ? `⏰ ${t.betting.closesIn} 0s`
              : `${t.betting.closesIn} ${bettingSecondsLeft}s`}
          </div>
        </RoundTimerFrame>
      )}

      {/* Action buttons for active player */}
      {canAct && (
        autoplay.enabled && autoplayRoundActive ? (
          <div className="text-amber-400/80 text-sm font-bold animate-pulse tracking-wider text-outline-sm">🤖 {t.autoplay.active}</div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {/* Player action countdown */}
            <RoundTimerFrame progress={playerActionProgress}>
              <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                playerActionSecondsLeft <= 3
                  ? 'border-red-400/30 bg-red-500/15 text-red-200 animate-pulse'
                  : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
              }`}>
                ⏱ {playerActionSecondsLeft}s
              </div>
            </RoundTimerFrame>
            <ActionButtons
              onHit={onHit}
              onStand={onStand}
              onDoubleDown={onDouble}
              canDoubleDown={myPlayer && activeHand ? canDD(activeHand) && myPlayer.balance >= activeHand.bet : false}
              onSplit={onSplit}
              canSplit={myPlayer && activeHand ? canSplit(activeHand, myPlayer.balance, gameState.settings, myPlayer.hands.length) : false}
              disabled={!canAct}
              onSurrender={onSurrender}
              canSurrender={myPlayer && activeHand ? canSurrenderFn(activeHand, gameState.settings.surrenderEnabled) : false}
            />
            {autoplay.enabled && !autoplayRoundActive && (
              <div className="text-amber-400/60 text-[10px] font-bold tracking-wider text-outline-sm uppercase bg-black/40 px-2 py-0.5 rounded-full border border-amber-900/50">
                🤖 {t.autoplay.queued}
              </div>
            )}
          </div>
        )
      )}

      {/* Betting panel */}
      {gameState.phase === 'betting' && myPlayer && !myPlayer.ready && !isSpectator && (!autoplay.enabled || autoplay.autoBet === 0) && (
        <BettingPanel balance={balance} currentBet={currentBet} onBetChange={setCurrentBet}
          onConfirmBet={onConfirmBet} onAllIn={onAllIn} disabled={myPlayer.ready}
          bettingTimeExpired={bettingTimeExpired} />
      )}
      {gameState.phase === 'betting' && myPlayer?.ready && !isSpectator && (
        <div className="text-yellow-300/70 text-sm font-bold animate-pulse text-outline-sm">⏳ {t.controls.waitingForPlayers}</div>
      )}

      {/* Results phase: admin-only "New Round" button; non-host sees waiting message */}
      {gameState.phase === 'results' && !isSpectator && !autoplay.enabled && (
        <div className="flex flex-col items-center gap-2 animate-bounce-in">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-yellow-200/78 text-outline-sm">
            {t.controls.nextRoundIn} {nextRoundSecondsLeft}s
          </div>
          {isHost ? (
            /* Host sees the "New Round" button with timer ring */
            <RoundTimerFrame progress={nextRoundProgress} rx={8} ry={8} padding="p-1.5">
              <button onClick={onNewRound}
                className="btn-cartoon px-10 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-lg border-yellow-600">
                🃏 {t.controls.newRound}
              </button>
            </RoundTimerFrame>
          ) : (
            /* Non-host players see a waiting message */
            <div className="rounded-full bg-yellow-600 border-b-[4px] border-yellow-800 px-6 py-2.5 text-sm font-bold text-yellow-50 shadow-xl uppercase tracking-wider">
              ⏳ {t.controls.waitingForNewRound}
            </div>
          )}
        </div>
      )}

      {/* Results for spectators */}
      {gameState.phase === 'results' && isSpectator && (
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-yellow-200/50 text-outline-sm">
          {t.controls.nextRoundIn} {nextRoundSecondsLeft}s
        </div>
      )}
    </div>
  );
}

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
  onJoinFromSpectator?: () => void;
}

export default function BottomControls({
  gameState, myPlayer, isSpectator, isHost, balance,
  currentBet, setCurrentBet,
  autoplay, autoplayRoundActive, bottomOffset,
  canAct, bettingSecondsLeft, bettingTimeExpired, bettingProgress,
  nextRoundProgress, nextRoundSecondsLeft,
  playerActionSecondsLeft, playerActionProgress,
  onHit, onStand, onDouble, onSplit, onSurrender,
  onConfirmBet, onAllIn, onNewRound, onJoinFromSpectator,
}: BottomControlsProps) {
  const { t } = useLanguage();
  const activeHand = myPlayer?.hands[myPlayer.activeHandIndex];

  return (
    <div
      className="relative z-30 flex flex-col items-center gap-2 sm:gap-2.5 px-2 pb-[max(12px,env(safe-area-inset-bottom))]"
      style={{ marginBottom: `${bottomOffset}px` }}
    >
      {/* Spectator CTA docked cleanly at the bottom instead of covering the table center */}
      {isSpectator && onJoinFromSpectator && (
        <button
          type="button"
          onClick={onJoinFromSpectator}
          className="btn-cartoon min-h-[46px] px-8 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-gray-950 text-sm sm:text-base font-bold border-yellow-700 shadow-xl animate-bounce-in"
        >
          {t.table.joinGame}
        </button>
      )}

      {/* Betting countdown with visual ring */}
      {gameState.phase === 'betting' && (
        <RoundTimerFrame progress={bettingProgress}>
          <div className={`rounded-full px-4 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-white shadow-xl tabular-nums ${
            bettingTimeExpired
              ? 'bg-red-600 border-b-[3px] border-red-800'
              : 'bg-[#1c6833] border-b-[3px] border-[#082712]'
          }`}>
            {bettingTimeExpired
              ? `${t.betting.closesIn} 0s`
              : `${t.betting.closesIn} ${bettingSecondsLeft}s`}
          </div>
        </RoundTimerFrame>
      )}

      {/* Action buttons for active player */}
      {canAct && (
        autoplay.enabled && autoplayRoundActive ? (
          <div className="text-amber-300/90 text-xs sm:text-sm font-bold animate-pulse tracking-wider text-outline-sm">{t.autoplay.active}</div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 sm:gap-2">
            {/* Player action countdown */}
            <RoundTimerFrame progress={playerActionProgress}>
              <div className={`rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums ${
                playerActionSecondsLeft <= 3
                  ? 'border-red-400/40 bg-red-500/20 text-red-200 animate-pulse'
                  : 'border-amber-300/25 bg-black/45 text-amber-100'
              }`}>
                {playerActionSecondsLeft}s
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
              canSurrender={myPlayer && activeHand ? canSurrenderFn(activeHand, gameState.settings.surrenderEnabled, myPlayer.hands.length) : false}
            />
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
        <div className="text-yellow-300/80 text-xs sm:text-sm font-bold animate-pulse text-outline-sm">{t.controls.waitingForPlayers}</div>
      )}

      {/* Results phase: admin-only "New Round" button; non-host sees waiting message */}
      {gameState.phase === 'results' && !isSpectator && !autoplay.enabled && (
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 animate-bounce-in">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-yellow-200/85 text-outline-sm tabular-nums">
            {t.controls.nextRoundIn} {nextRoundSecondsLeft}s
          </div>
          {isHost ? (
            /* Host sees the "New Round" button with timer ring */
            <RoundTimerFrame progress={nextRoundProgress} rx={8} ry={8} padding="p-1">
              <button
                type="button"
                onClick={onNewRound}
                className="btn-cartoon min-h-[44px] px-7 sm:px-10 py-2.5 sm:py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-950 text-sm sm:text-base border-yellow-700"
              >
                {t.controls.newRound}
              </button>
            </RoundTimerFrame>
          ) : (
            /* Non-host players see a waiting message */
            <div className="rounded-full bg-[#14502a] border-2 border-[#416e4e] px-5 py-2 text-xs sm:text-sm font-bold text-yellow-100 shadow-xl uppercase tracking-wider">
              {t.controls.waitingForNewRound}
            </div>
          )}
        </div>
      )}

      {/* Results for spectators */}
      {gameState.phase === 'results' && isSpectator && (
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-yellow-200/65 text-outline-sm tabular-nums">
          {t.controls.nextRoundIn} {nextRoundSecondsLeft}s
        </div>
      )}
    </div>
  );
}

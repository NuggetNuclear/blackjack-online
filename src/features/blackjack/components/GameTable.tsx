'use client';

import { memo } from 'react';
import { GameState, PlayerState } from '@/features/blackjack/lib/blackjack';
import { MoneyRain, LoseVignette } from '@/features/blackjack/components/Effects';
import HandDisplay from '@/features/blackjack/components/HandDisplay';
import PlayerSeats from '@/features/blackjack/components/PlayerSeats';
import InsurancePrompt from '@/features/blackjack/components/InsurancePrompt';
import BottomControls from '@/features/blackjack/components/BottomControls';
import HistoryPanel from '@/features/blackjack/components/HistoryPanel';
import GameHeader from '@/features/blackjack/components/GameHeader';
import TableSurface from '@/features/blackjack/components/TableSurface';
import { BetRecord } from '@/features/blackjack/lib/history';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useLanguage } from '@/shared/i18n/useLanguage';

const BOTTOM_OFFSET_OPTIONS = [0, 16, 32] as const;

interface GameTableProps {
  gameState: GameState;
  myId: string;
  myPlayer: PlayerState | undefined;
  isSpectator: boolean;
  isHost: boolean;
  balance: number;
  currentBet: number;
  setCurrentBet: (b: number) => void;
  autoplay: AutoplayConfig;
  onAutoplayChange: (cfg: AutoplayConfig) => void;
  autoplayRoundActive: boolean;
  canAct: boolean;
  bottomOffsetIndex: number;
  setBottomOffsetIndex: (i: number) => void;
  soundOn: boolean;
  setSoundOn: (s: boolean) => void;
  roomCode: string;
  copied: boolean;
  connectionStatus: string;
  localToast?: string;
  leaderName: string;
  showMoneyRain: boolean;
  showLoseVignette: boolean;
  history: BetRecord[];
  insurancePromptDismissed: boolean;
  bettingSecondsLeft: number;
  bettingTimeExpired: boolean;
  bettingProgress: number;
  nextRoundProgress: number;
  nextRoundSecondsLeft: number;
  playerActionSecondsLeft: number;
  playerActionProgress: number;

  // Handlers
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onSurrender: () => void;
  onInsure: () => void;
  onDeclineInsurance: () => void;
  onConfirmBet: () => void;
  onAllIn: () => void;
  onNewRound: () => void;
  onCopyLink: () => void;
  onSwitchToSpectator: () => void;
  onExitRoom: () => void;
  onJoinFromSpectator: () => void;
}

function GameTable({
  gameState, myId, myPlayer, isSpectator, isHost, balance,
  currentBet, setCurrentBet,
  autoplay, onAutoplayChange, autoplayRoundActive,
  canAct, bottomOffsetIndex, setBottomOffsetIndex,
  soundOn, setSoundOn,
  roomCode, copied, connectionStatus, localToast, leaderName,
  showMoneyRain, showLoseVignette,
  history, insurancePromptDismissed,
  bettingSecondsLeft, bettingTimeExpired, bettingProgress, nextRoundProgress, nextRoundSecondsLeft,
  playerActionSecondsLeft, playerActionProgress,
  onHit, onStand, onDouble, onSplit, onSurrender,
  onInsure, onDeclineInsurance,
  onConfirmBet, onAllIn, onNewRound,
  onCopyLink, onSwitchToSpectator, onExitRoom, onJoinFromSpectator,
}: GameTableProps) {
  const { t } = useLanguage();
  const bottomOffset = BOTTOM_OFFSET_OPTIONS[bottomOffsetIndex];
  const seatLift = Math.min(bottomOffset / 10, 8);
  const hasMultiplePlayers = Object.keys(gameState.players).length > 1;
  const waitingForNextRound = !!myPlayer
    && gameState.phase !== 'betting'
    && myPlayer.hands.every((hand) => hand.cards.length === 0);

  return (
    <div
      className="casino-scene flex min-h-[100dvh] flex-col relative overflow-x-hidden overflow-y-auto select-none"
      style={{
        height: 'var(--app-height)',
      }}
    >
      {/* Effects */}
      <MoneyRain active={showMoneyRain} />
      <LoseVignette active={showLoseVignette} />

      <TableSurface bottomInset={24 + bottomOffset} />

      {/* Table felt markings */}
      <div
        className="absolute pointer-events-none z-[3] overflow-hidden"
        style={{
          left: 'calc(3% + 20px)',
          right: 'calc(3% + 20px)',
          top: 'calc(5% + 20px)',
          bottom: `${24 + bottomOffset + 16}px`,
        }}
      >
        <div
          className={`${hasMultiplePlayers ? 'hidden sm:flex' : 'flex'} absolute inset-x-4 flex-col items-center gap-0.5 text-center`}
          style={{ top: '30%' }}
        >
          <div className="text-yellow-400/[0.15] text-[8px] sm:text-xs font-bold tracking-[0.12em] sm:tracking-[0.3em] uppercase whitespace-nowrap">
            ♠ {t.table.blackjackPays} ♠
          </div>
          <div className="text-yellow-400/[0.11] text-[7px] sm:text-[11px] font-semibold tracking-[0.08em] sm:tracking-[0.22em] uppercase whitespace-nowrap">
            {t.table.dealerStands}
          </div>
        </div>
        <div className="hidden sm:flex absolute left-[24%] right-[24%] items-center gap-3" style={{ top: '47%' }}>
          <div className="flex-1 h-px bg-yellow-400/[0.08]" />
          <span className="text-yellow-400/[0.11] text-[9px] font-semibold tracking-[0.18em] uppercase whitespace-nowrap">
            {t.table.insurancePays}
          </span>
          <div className="flex-1 h-px bg-yellow-400/[0.08]" />
        </div>
        <div className="hidden sm:block absolute text-yellow-400/[0.07] text-3xl select-none" style={{ top: '22%', left: '12%' }}>♠</div>
        <div className="hidden sm:block absolute text-red-400/[0.07] text-3xl select-none" style={{ top: '22%', right: '12%' }}>♥</div>
        <div className="hidden sm:block absolute text-red-400/[0.05] text-2xl select-none" style={{ top: '52%', left: '8%' }}>♦</div>
        <div className="hidden sm:block absolute text-yellow-400/[0.05] text-2xl select-none" style={{ top: '52%', right: '8%' }}>♣</div>
      </div>

      {/* Header */}
      <GameHeader
        roomCode={roomCode}
        copied={copied}
        isSpectator={isSpectator}
        balance={balance}
        leaderName={leaderName}
        autoplay={autoplay}
        onAutoplayChange={onAutoplayChange}
        soundOn={soundOn}
        setSoundOn={setSoundOn}
        bottomOffsetIndex={bottomOffsetIndex}
        setBottomOffsetIndex={setBottomOffsetIndex}
        onCopyLink={onCopyLink}
        onSwitchToSpectator={onSwitchToSpectator}
        onExitRoom={onExitRoom}
      />

      {/* History */}
      <HistoryPanel history={history} bottomOffset={bottomOffset} />

      {/* Card shoe — scaled down on mobile so it never crowds the dealer */}
      <div id="card-shoe" className="pointer-events-none absolute left-3.5 top-[56px] z-20 flex flex-col items-center sm:left-5 sm:top-[84px]">
        <div className="relative w-8 h-11 sm:w-[68px] sm:h-[96px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-lg sm:rounded-xl border-2 sm:border-[3px] border-red-800/60 overflow-hidden"
              style={{
                background: '#8B0000',
                top: `${-i * 2}px`,
                left: `${i}px`,
                zIndex: 3 - i,
                boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0L20 10L10 20L0 10Z' fill='%23a01010' stroke='%23700' stroke-width='0.5'/%3E%3C/svg%3E")`,
                  backgroundSize: '10px 10px',
                }}
              />
            </div>
          ))}
        </div>
        <span className="mt-1 hidden sm:block text-[9px] font-bold tracking-wider text-white/30">{t.table.deck}</span>
      </div>

      {/* Table content */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-between px-2 py-1 sm:px-4 sm:py-2">
        {/* Dealer + Phase Divider */}
        <div className="flex flex-col items-center pt-1 sm:pt-3 shrink-0">
          <HandDisplay
            hand={gameState.dealer}
            label={`${t.game.dealer}`}
            isDealer
            showValue={gameState.phase === 'results' || gameState.phase === 'dealer-turn'}
          />

          <div className="relative mt-1 sm:mt-1.5 mx-auto w-[72%] sm:w-[58%] h-4 sm:h-5 flex items-center">
            <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-500/20 rounded-full" />
            <span className="relative mx-auto rounded-full bg-[#0c321f]/90 px-3 py-0.5 text-yellow-300/70 text-[9px] sm:text-[11px] font-bold tracking-[0.12em] sm:tracking-[0.2em] uppercase whitespace-nowrap">
              {gameState.phase === 'betting' && `${t.table.placeBets}`}
              {gameState.phase === 'playing' && `${t.table.playersTurn}`}
              {gameState.phase === 'dealer-turn' && `${t.table.dealerTurn}`}
              {gameState.phase === 'results' && `${t.table.results}`}
            </span>
          </div>
        </div>

        {/* Player seats */}
        <PlayerSeats gameState={gameState} myId={myId} seatLift={seatLift} currentBet={currentBet} />

        {/* Global Table Message Toast */}
        {gameState.tableMessage && (
          <div key={gameState.tableMessage.id} className="pointer-events-none absolute inset-x-3 top-[38%] z-50 flex justify-center animate-bounce-in">
            <div className="rounded-2xl border-2 border-yellow-600 bg-[#0a2719]/95 px-5 py-2.5 text-xs sm:text-sm font-bold text-yellow-200 shadow-2xl tracking-wide text-center">
              {gameState.tableMessage.text}
            </div>
          </div>
        )}

        {/* Bottom Dock: Insurance + Controls */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 shrink-0 w-full">
          {waitingForNextRound && !isSpectator && (
            <div className="rounded-full border border-white/15 bg-black/55 px-4 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200 shadow-lg">
              {t.seats.joiningNextRound}
            </div>
          )}

          <InsurancePrompt
            gameState={gameState}
            myPlayer={myPlayer}
            insurancePromptDismissed={insurancePromptDismissed}
            balance={balance}
            onInsure={onInsure}
            onDecline={onDeclineInsurance}
          />

          <BottomControls
            gameState={gameState}
            myPlayer={myPlayer}
            isSpectator={isSpectator}
            isHost={isHost}
            balance={balance}
            currentBet={currentBet}
            setCurrentBet={setCurrentBet}
            autoplay={autoplay}
            autoplayRoundActive={autoplayRoundActive}
            bottomOffset={bottomOffset}
            canAct={canAct}
            bettingSecondsLeft={bettingSecondsLeft}
            bettingTimeExpired={bettingTimeExpired}
            bettingProgress={bettingProgress}
            nextRoundProgress={nextRoundProgress}
            nextRoundSecondsLeft={nextRoundSecondsLeft}
            playerActionSecondsLeft={playerActionSecondsLeft}
            playerActionProgress={playerActionProgress}
            onHit={onHit}
            onStand={onStand}
            onDouble={onDouble}
            onSplit={onSplit}
            onSurrender={onSurrender}
            onConfirmBet={onConfirmBet}
            onAllIn={onAllIn}
            onNewRound={onNewRound}
            onJoinFromSpectator={onJoinFromSpectator}
          />
        </div>
      </div>

      {/* Persistent Connection Status */}
      {connectionStatus && connectionStatus !== 'Connected!' && !waitingForNextRound && (
        <div className="pointer-events-none fixed inset-x-0 top-[68px] sm:top-[76px] z-30 flex justify-center px-3">
          <div className="rounded-full border border-yellow-500/25 bg-black/75 px-4 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-yellow-200 shadow-lg">
            {connectionStatus}
          </div>
        </div>
      )}

      {/* Ephemeral Toasts */}
      {localToast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 top-[56px] sm:top-auto sm:left-4 sm:translate-x-0 bg-[#0a2719]/95 text-emerald-200 text-[11px] px-3 py-1.5 rounded-xl z-50 font-bold border border-[#416e4e] shadow-lg animate-fade-in whitespace-nowrap sm:bottom-[var(--toast-bottom)]"
          style={{ '--toast-bottom': `${12 + bottomOffset}px` } as React.CSSProperties}
        >
          {localToast}
        </div>
      )}
    </div>
  );
}

export default memo(GameTable);

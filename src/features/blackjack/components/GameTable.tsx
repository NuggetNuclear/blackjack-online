'use client';

import { GameState, PlayerState } from '@/features/blackjack/lib/blackjack';
import { MoneyRain, LoseVignette } from '@/features/blackjack/components/Effects';
import HandDisplay from '@/features/blackjack/components/HandDisplay';
import PlayerSeats from '@/features/blackjack/components/PlayerSeats';
import InsurancePrompt from '@/features/blackjack/components/InsurancePrompt';
import BottomControls from '@/features/blackjack/components/BottomControls';
import HistoryPanel from '@/features/blackjack/components/HistoryPanel';
import GameHeader from '@/features/blackjack/components/GameHeader';
import { BetRecord } from '@/features/blackjack/lib/history';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useLanguage } from '@/shared/i18n/useLanguage';

const BOTTOM_OFFSET_OPTIONS = [0, 48, 88] as const;

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

export default function GameTable({
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
  const waitingForNextRound = !!myPlayer
    && gameState.phase !== 'betting'
    && myPlayer.hands.every((hand) => hand.cards.length === 0);

  return (
    <div className="flex min-h-[var(--app-height)] flex-col relative overflow-hidden select-none"
      style={{
        height: 'var(--app-height)',
        background: 'radial-gradient(ellipse at 50% 50%, #6b0000 0%, #4a0000 40%, #2a0000 70%, #120000 100%)',
      }}>

      {/* Effects */}
      <MoneyRain active={showMoneyRain} />
      <LoseVignette active={showLoseVignette} />

      {/* Casino floor pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='20' height='20' fill='%23fff'/%3E%3Crect x='20' y='20' width='20' height='20' fill='%23fff'/%3E%3C/svg%3E")`,
        }} />

      {/* Wood outer rim */}
      <div className="absolute inset-x-[3%] top-[5%] rounded-[50%] pointer-events-none z-[1]"
        style={{
          bottom: `${36 + bottomOffset}px`,
          background: 'linear-gradient(160deg, #c8813a 0%, #8B4513 20%, #6B3311 40%, #9a5c2e 55%, #7a3f16 70%, #c17f3a 85%, #8B4513 100%)',
          boxShadow: '0 0 0 8px #4a2008, 0 12px 60px rgba(0,0,0,0.7), inset 0 2px 6px rgba(255,200,100,0.25)',
        }} />

      {/* Green felt inner surface */}
      <div className="absolute rounded-[50%] pointer-events-none z-[2]"
        style={{
          left: 'calc(3% + 18px)', right: 'calc(3% + 18px)',
          top: 'calc(5% + 18px)', bottom: `${36 + bottomOffset + 18}px`,
          background: 'radial-gradient(ellipse at 50% 35%, #1d7a38 0%, #145a28 50%, #0e4020 80%, #0a3018 100%)',
          boxShadow: 'inset 0 0 80px rgba(0,0,0,0.35), inset 0 0 30px rgba(0,0,0,0.2)',
        }} />

      {/* Table felt markings */}
      <div className="absolute pointer-events-none z-[3]"
        style={{
          left: 'calc(3% + 20px)', right: 'calc(3% + 20px)',
          top: 'calc(5% + 20px)', bottom: `${36 + bottomOffset + 20}px`,
          clipPath: 'ellipse(50% 50% at 50% 50%)',
        }}>
        <div className="absolute" style={{ top: '35%', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="flex flex-col items-center gap-0.5">
            <div className="text-yellow-400/[0.18] text-[9px] sm:text-sm font-bold tracking-[0.15em] sm:tracking-[0.35em] uppercase whitespace-nowrap">
              ♠ {t.table.blackjackPays} ♠
            </div>
            <div className="text-yellow-400/[0.13] text-[8px] sm:text-xs font-semibold tracking-[0.1em] sm:tracking-[0.25em] uppercase whitespace-nowrap">
              {t.table.dealerStands}
            </div>
          </div>
        </div>
        <div className="absolute left-[30%] right-[30%] flex items-center gap-3" style={{ top: '48%' }}>
          <div className="flex-1 h-px bg-yellow-400/[0.09]" />
          <span className="text-yellow-400/[0.12] text-[7px] sm:text-[10px] font-semibold tracking-[0.1em] sm:tracking-[0.2em] uppercase whitespace-nowrap">
            {t.table.insurancePays}
          </span>
          <div className="flex-1 h-px bg-yellow-400/[0.09]" />
        </div>
        <div className="absolute text-yellow-400/[0.08] text-2xl sm:text-4xl select-none" style={{ top: '22%', left: '12%' }}>♠</div>
        <div className="absolute text-red-400/[0.08] text-2xl sm:text-4xl select-none" style={{ top: '22%', right: '12%' }}>♥</div>
        <div className="absolute text-red-400/[0.06] text-xl sm:text-3xl select-none" style={{ top: '52%', left: '8%' }}>♦</div>
        <div className="absolute text-yellow-400/[0.06] text-xl sm:text-3xl select-none" style={{ top: '52%', right: '8%' }}>♣</div>
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

      {/* Card shoe */}
      <div id="card-shoe" className="absolute left-4 top-[92px] z-30 flex flex-col items-center sm:left-5 sm:top-[104px]">
        <div className="relative w-[76px] h-[106px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="absolute w-[76px] h-[106px] rounded-xl border-[3px] border-red-800/60 overflow-hidden"
              style={{
                background: '#8B0000',
                top: `${-i * 2}px`, left: `${i}px`, zIndex: 4 - i,
                boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
              }}>
              <div className="absolute inset-0" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0L20 10L10 20L0 10Z' fill='%23a01010' stroke='%23700' stroke-width='0.5'/%3E%3C/svg%3E")`,
                backgroundSize: '10px 10px',
              }} />
            </div>
          ))}
        </div>
        <span className="mt-1.5 text-[9px] font-bold tracking-wider text-white/30">{t.table.deck}</span>
      </div>

      {/* Table content */}
      <div className="relative z-10 flex-1 flex flex-col">

        {/* Dealer */}
        <div className="flex flex-col items-center pt-4 pb-1">
          <HandDisplay hand={gameState.dealer} label={`${t.game.dealer}`} isDealer
            showValue={gameState.phase === 'results' || gameState.phase === 'dealer-turn'} />
        </div>

        {/* Phase text */}
        <div className="relative my-1 mx-auto w-[70%] sm:w-[60%] h-6 flex items-center">
          <div className="absolute inset-x-0 top-1/2 h-[2px] bg-yellow-500/15 rounded-full" />
          <span className="absolute left-1/2 -translate-x-1/2 bg-[#0a3018] px-3 text-yellow-400/50 text-[10px] sm:text-xs font-bold tracking-[0.1em] sm:tracking-[0.2em] uppercase text-outline-sm whitespace-nowrap">
            {gameState.phase === 'betting' && `${t.table.placeBets}`}
            {gameState.phase === 'playing' && `${t.table.playersTurn}`}
            {gameState.phase === 'dealer-turn' && `${t.table.dealerTurn}`}
            {gameState.phase === 'results' && `${t.table.results}`}
          </span>
        </div>

        {/* Player seats */}
        <PlayerSeats gameState={gameState} myId={myId} seatLift={seatLift} currentBet={currentBet} />

        {/* Global Table Message Toast */}
        {gameState.tableMessage && (
          <div key={gameState.tableMessage.id} className="pointer-events-none absolute inset-x-0 top-[40%] z-50 flex justify-center animate-bounce-in drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]">
            <div className="rounded-2xl border-b-4 border-yellow-700 bg-yellow-500 px-6 py-3 font-bold text-yellow-50 shadow-2xl tracking-wide">
              {gameState.tableMessage.text}
            </div>
          </div>
        )}

        {waitingForNextRound && !isSpectator && (
          <div className="pointer-events-none absolute inset-x-0 top-[52%] z-30 flex justify-center">
            <div className="rounded-full border border-white/12 bg-black/55 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200 shadow-lg">
              {t.seats.joiningNextRound}
            </div>
          </div>
        )}

        {/* Insurance Prompt */}
        <InsurancePrompt
          gameState={gameState}
          myPlayer={myPlayer}
          insurancePromptDismissed={insurancePromptDismissed}
          balance={balance}
          onInsure={onInsure}
          onDecline={onDeclineInsurance}
        />

        {/* Spectator Join Button */}
        {isSpectator && (
          <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
            <button onClick={onJoinFromSpectator}
              className="btn-cartoon px-12 py-5 bg-green-500 hover:bg-green-400 text-white text-2xl font-bold border-green-700 shadow-2xl animate-bounce-in pointer-events-auto"
              style={{ boxShadow: '0 0 40px rgba(34,197,94,0.4), 0 8px 32px rgba(0,0,0,0.5)' }}>
              🎮 {t.table.joinGame}
            </button>
          </div>
        )}

        {/* Bottom controls */}
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
        />
      </div>

      {/* Persistent Connection Warnings */}
      {connectionStatus && connectionStatus !== 'Connected!' && (
        <div className="pointer-events-none absolute inset-x-0 top-[60%] z-40 flex justify-center">
          <div className="rounded-full border border-yellow-500/20 bg-black/75 px-5 py-2 text-[12px] font-bold uppercase tracking-[0.2em] text-yellow-300 drop-shadow-xl">
            {connectionStatus}
          </div>
        </div>
      )}

      {/* Ephemeral Toasts */}
      {localToast && (
        <div className="fixed left-4 bg-black/60 text-green-300/70 text-[11px] px-3 py-1.5 rounded-xl z-50 font-bold border-2 border-green-700/30 animate-fade-in"
          style={{ bottom: `${16 + bottomOffset}px` }}>
          {localToast}
        </div>
      )}

      {/* Version Tag */}
      <div className="fixed bottom-1 left-2 z-50 pointer-events-none">
        <span className="text-[10px] font-bold tracking-widest text-white/20 uppercase">
          v1.1.1
        </span>
      </div>
    </div>
  );
}

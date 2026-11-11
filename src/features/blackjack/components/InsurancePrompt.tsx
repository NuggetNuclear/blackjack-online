'use client';

import { GameState, PlayerState, dealerShowsAce } from '@/features/blackjack/lib/blackjack';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

interface InsurancePromptProps {
  gameState: GameState;
  myPlayer: PlayerState | undefined;
  insurancePromptDismissed: boolean;
  balance: number;
  onInsure: () => void;
  onDecline: () => void;
}

export default function InsurancePrompt({
  gameState, myPlayer, insurancePromptDismissed,
  balance, onInsure, onDecline,
}: InsurancePromptProps) {
  const { t } = useLanguage();

  if (gameState.phase !== 'playing') return null;
  if (!gameState.settings.insuranceEnabled) return null;
  if (!dealerShowsAce(gameState)) return null;
  // Match the engine rule: insurance only on the un-acted initial hand.
  if (!myPlayer || myPlayer.hands.length !== 1) return null;
  const firstHand = myPlayer.hands[0];
  if (firstHand.cards.length !== 2) return null;
  if (firstHand.stood || firstHand.busted || firstHand.surrendered || firstHand.blackjack) return null;
  if (firstHand.insuranceBet > 0 || firstHand.insuranceDecided) return null;
  if (insurancePromptDismissed) return null;

  return (
    <div className="relative z-40 flex justify-center px-3 animate-fade-in">
      <div className="panel-surface flex w-full max-w-xs sm:max-w-sm flex-col items-center gap-2.5 border-2 border-yellow-500/70 px-4 py-3 shadow-2xl">
        <div className="text-yellow-300 font-bold text-center">
          <p className="text-sm sm:text-base uppercase tracking-wider text-outline-sm">{t.game.insurancePrompt}</p>
          <p className="text-xs sm:text-sm text-white/85 tabular-nums">
            {t.game.insuranceCost}{formatCurrency(Math.floor(firstHand.bet / 2))}
          </p>
        </div>
        <div className="flex w-full gap-2.5">
          <button
            type="button"
            onClick={onInsure}
            disabled={balance < Math.floor(firstHand.bet / 2)}
            className="btn-cartoon min-h-[40px] flex-1 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-bold text-xs sm:text-sm border-yellow-700 disabled:opacity-50"
          >
            {t.game.buyInsurance}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="btn-cartoon min-h-[40px] flex-1 px-4 py-2 bg-[#14502a] hover:bg-[#1c6833] text-white font-bold text-xs sm:text-sm border-[#082712]"
          >
            {t.game.decline}
          </button>
        </div>
      </div>
    </div>
  );
}

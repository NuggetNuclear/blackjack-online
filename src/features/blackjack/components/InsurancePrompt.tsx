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
  if (firstHand.insuranceBet > 0) return null;
  if (insurancePromptDismissed) return null;

  return (
    <div className="absolute inset-x-0 bottom-40 flex justify-center z-50 pointer-events-none animate-fade-in">
      <div className="bg-black/80 border-2 border-yellow-500 rounded-2xl p-4 shadow-[0_0_30px_rgba(234,179,8,0.3)] pointer-events-auto backdrop-blur-sm flex flex-col items-center gap-3">
        <div className="text-yellow-400 font-bold text-center">
          <p className="text-xl uppercase tracking-wider text-outline-sm">{t.game.insurancePrompt}</p>
          <p className="text-sm opacity-80">{t.game.insuranceCost}{formatCurrency(Math.floor(firstHand.bet / 2))}</p>
        </div>
        <div className="flex gap-3 mt-1">
          <button onClick={onInsure} disabled={balance < firstHand.bet / 2}
            className="btn-cartoon px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm border-yellow-700 disabled:opacity-50">
            {t.game.buyInsurance}
          </button>
          <button onClick={onDecline}
            className="btn-cartoon px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm border-gray-800">
            {t.game.decline}
          </button>
        </div>
      </div>
    </div>
  );
}

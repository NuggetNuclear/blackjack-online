'use client';

import CardComponent from './Card';
import { ChipStack } from './Chip';
import { Hand, handValue } from '@/features/blackjack/lib/blackjack';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { formatCurrency } from '@/shared/lib/format';

interface HandDisplayProps {
  hand: Hand;
  label?: string;
  isDealer?: boolean;
  result?: 'win' | 'lose' | 'push' | 'blackjack';
  payout?: number;
  showValue?: boolean;
  isCurrentPlayer?: boolean;
}

export default function HandDisplay({
  hand,
  label,
  isDealer = false,
  result,
  payout,
  showValue = true,
  isCurrentPlayer = false,
}: HandDisplayProps) {
  const { t } = useLanguage();
  const value = handValue(hand.cards.filter((c) => c.faceUp));
  const hasFaceDown = hand.cards.some((c) => !c.faceUp);

  // Dealers always show their visible card count; others only when showValue is true
  const shouldShowValue = isDealer ? hand.cards.length > 0 : showValue && hand.cards.length > 0;

  const resultColors: Record<string, string> = {
    win: 'text-green-300',
    lose: 'text-red-400',
    push: 'text-yellow-300',
    blackjack: 'text-yellow-200',
  };

  const resultLabels: Record<string, string> = {
    win: `${t.results.win}`,
    lose: `${t.results.lose}`,
    push: `${t.results.push}`,
    blackjack: `${t.results.blackjack}`,
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 ${isCurrentPlayer ? 'scale-105' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`${isCurrentPlayer ? 'text-yellow-300 text-outline-sm' : 'text-white/80'} text-xs font-semibold`}>{label}</span>
        {shouldShowValue && (
          <span className="bg-black/70 text-white px-2 py-0.5 rounded-full text-[11px] font-bold border border-white/20"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            {hasFaceDown ? `${value}+?` : value}
            {!hasFaceDown && hand.busted && <span className="text-red-400 ml-1 animate-wiggle inline-block">{t.results.bust}</span>}
            {!hasFaceDown && hand.blackjack && <span className="text-yellow-300 ml-1">{t.results.bj}</span>}
          </span>
        )}
      </div>

      <div className="flex items-center">
        {hand.cards.map((card, i) => (
          <CardComponent
            key={`${card.rank}-${card.suit}-${i}`}
            card={card}
            index={i}
            small={!isCurrentPlayer && !isDealer}
            animated={true}
            animationType={hand.stood && !hand.busted && !isDealer ? 'drop' : 'slide'}
          />
        ))}
        {hand.cards.length === 0 && (
          <div className={`${isDealer || isCurrentPlayer ? 'w-[76px] h-[106px]' : 'w-13 h-[72px]'} border-[2.5px] border-dashed border-white/15 rounded-xl`} />
        )}
      </div>

      {hand.bet > 0 && <ChipStack total={hand.bet} small={!isCurrentPlayer} />}

      {result && (
        <div className={`text-base font-bold text-outline-sm animate-bounce-in ${resultColors[result]} ${result === 'blackjack' ? 'animate-pulse text-lg' : ''}`}>
          {resultLabels[result]}
          {payout !== undefined && payout > 0 && result !== 'lose' && (
            <span className="ml-1.5 text-sm text-green-300">+{formatCurrency(payout)}</span>
          )}
        </div>
      )}
    </div>
  );
}

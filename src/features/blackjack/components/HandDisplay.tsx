'use client';

import { memo } from 'react';
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
  forceSmall?: boolean;
}

function HandDisplay({
  hand,
  label,
  isDealer = false,
  result,
  payout,
  showValue = true,
  isCurrentPlayer = false,
  forceSmall = false,
}: HandDisplayProps) {
  const { t } = useLanguage();
  const value = handValue(hand.cards.filter((c) => c.faceUp));
  const hasFaceDown = hand.cards.some((c) => !c.faceUp);
  const useSmallCards = forceSmall || (!isCurrentPlayer && !isDealer);

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
    <div className="flex flex-col items-center gap-1 sm:gap-1.5">
      {(label || shouldShowValue) && (
        <div className="flex items-center gap-1.5">
          {label && (
            <span className={`${isCurrentPlayer ? 'text-yellow-300 text-outline-sm font-bold' : 'text-white/85 font-semibold'} text-[11px] sm:text-xs max-w-[130px] truncate`}>
              {label}
            </span>
          )}
          {shouldShowValue && (
            <span className="bg-black/75 text-white px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold border border-white/20 tabular-nums"
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
              {hasFaceDown ? `${value}+?` : value}
              {!hasFaceDown && hand.busted && <span className="text-red-400 ml-1 animate-wiggle inline-block">{t.results.bust}</span>}
              {!hasFaceDown && hand.blackjack && <span className="text-yellow-300 ml-1">{t.results.bj}</span>}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-center">
        {hand.cards.map((card, i) => (
          <CardComponent
            key={`${card.rank}-${card.suit}-${i}`}
            card={card}
            index={i}
            small={useSmallCards}
            animated={true}
            animationType={hand.stood && !hand.busted && !isDealer ? 'drop' : 'slide'}
          />
        ))}
        {hand.cards.length === 0 && (
          <div className={`${!useSmallCards ? 'w-[58px] h-[82px] sm:w-[76px] sm:h-[106px]' : 'w-11 h-[62px] sm:w-13 sm:h-[72px]'} border-[2px] border-dashed border-white/20 rounded-xl`} />
        )}
      </div>

      {hand.bet > 0 && <ChipStack total={hand.bet} small={useSmallCards} />}

      {result && (
        <div className={`text-sm sm:text-base font-bold text-outline-sm animate-bounce-in tabular-nums ${resultColors[result]} ${result === 'blackjack' ? 'animate-pulse sm:text-lg' : ''}`}>
          {resultLabels[result]}
          {payout !== undefined && payout > 0 && result !== 'lose' && (
            <span className="ml-1.5 text-xs sm:text-sm text-green-300">+{formatCurrency(payout)}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(HandDisplay);

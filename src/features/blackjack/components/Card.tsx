'use client';

import { memo, useLayoutEffect, useRef } from 'react';
import { type Card as CardType, suitSymbol, suitColor } from '@/features/blackjack/lib/blackjack';
import { useIsMobile } from '@/shared/hooks/useIsMobile';

interface CardProps {
  card: CardType;
  index?: number;
  small?: boolean;
  animated?: boolean;
  animationType?: 'slide' | 'drop';
}

function Card({ card, index = 0, small = false, animated = true, animationType = 'slide' }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const animatedOnceRef = useRef(false);
  const isMobile = useIsMobile();
  const w = isMobile
    ? (small ? 'w-10 h-[56px]' : 'w-[50px] h-[70px]')
    : (small ? 'w-10 h-[56px] sm:w-13 sm:h-[72px]' : 'w-[50px] h-[70px] sm:w-[76px] sm:h-[106px]');
  const textSize = isMobile
    ? (small ? 'text-[9px]' : 'text-[11px]')
    : (small ? 'text-[9px] sm:text-[11px]' : 'text-[11px] sm:text-base');
  const overlapClass = index > 0
    ? (isMobile ? (small ? '-ml-3' : '-ml-3.5') : (small ? '-ml-3 sm:-ml-2.5' : '-ml-3.5 sm:-ml-3.5'))
    : '';
  const borderClass = isMobile ? 'border-[2.5px]' : 'border-[2.5px] sm:border-[3px]';
  
  useLayoutEffect(() => {
    if (!animated || !cardRef.current || animationType !== 'slide') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof cardRef.current.animate !== 'function') return;
    if (animatedOnceRef.current) return;
    animatedOnceRef.current = true;
    
    // Instead of completely generic CSS animations, we use Native Web Animations
    // to dynamically calculate the exact pixel difference between the deck and this card's slot.
    const shoeEl = document.getElementById('card-shoe');
    if (!shoeEl) return;
    
    const shoeRect = shoeEl.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    
    // Calculate the distance vector from the shoe to the card's final resting place
    const dx = shoeRect.left - cardRect.left;
    const dy = shoeRect.top - cardRect.top;
    
    // We animate from the shoe's position to its final position
    const animation = cardRef.current.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(-15deg) scale(0.6)`, opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 }
    ], {
      duration: 350 + (Math.random() * 50),
      delay: index * 90,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both'
    });
    
    return () => animation.cancel();
  }, [animated, index, animationType]);

  // If using the new JS slide animation, don't mix it with the old CSS class
  const animClass = animated && animationType === 'drop' ? 'animate-card-drop' : '';

  if (!card.faceUp) {
    return (
      <div
        ref={cardRef}
        className={`${w} ${overlapClass} rounded-xl ${borderClass} border-red-800 shadow-xl flex items-center justify-center relative shrink-0 overflow-hidden ${animClass}`}
        style={{
          background: '#8B0000',
          zIndex: index,
          animationDelay: `${index * 0.12}s`,
          animationFillMode: 'backwards',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,200,200,0.15)',
        }}
      >
        {/* Diamond lattice pattern */}
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0L20 10L10 20L0 10Z' fill='%23a01010' stroke='%23700' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: small ? '10px 10px' : '14px 14px',
        }} />
        {/* Inner border frame */}
        <div className={`absolute ${small ? 'inset-[3px]' : (isMobile ? 'inset-[4px]' : 'inset-[4px] sm:inset-[6px]')} border-[1.5px] ${isMobile ? '' : 'sm:border-[2px]'} border-yellow-400/25 rounded-lg`} />
        {/* Center emblem */}
        <div className="relative z-10 flex items-center justify-center">
          <span className={`${small ? 'text-base' : (isMobile ? 'text-xl' : 'text-xl sm:text-3xl')} text-yellow-400/40 font-bold`}>♠</span>
        </div>
      </div>
    );
  }

  const color = suitColor(card.suit);
  const symbol = suitSymbol(card.suit);
  const cornerColor = color === '#ef4444' ? '#b91c1c' : color;

  return (
    <div
      ref={cardRef}
      className={`${w} ${overlapClass} bg-white rounded-xl ${borderClass} flex flex-col justify-between relative select-none shrink-0 ${animClass}`}
      style={{
        zIndex: index,
        padding: small ? '3px' : '4px 5px',
        animationDelay: `${index * 0.12}s`,
        animationFillMode: 'backwards',
        borderColor: color === '#ef4444' ? '#fca5a5' : '#94a3b8',
        boxShadow: `0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.6)`,
      }}
    >
      <div className={`${textSize} font-bold leading-none`} style={{ color: cornerColor }}>
        {card.rank}
        <span className={`block ${small ? (isMobile ? 'text-[8px]' : 'text-[8px] sm:text-[9px]') : (isMobile ? 'text-[10px]' : 'text-[10px] sm:text-xs')}`}>{symbol}</span>
      </div>
      <div className={`${small ? (isMobile ? 'text-lg' : 'text-lg sm:text-xl') : (isMobile ? 'text-xl' : 'text-xl sm:text-3xl')} text-center leading-none`} style={{ color }}>
        {symbol}
      </div>
      <div
        className={`${textSize} font-bold leading-none self-end rotate-180`}
        style={{ color: cornerColor }}
      >
        {card.rank}
        <span className={`block ${small ? (isMobile ? 'text-[8px]' : 'text-[8px] sm:text-[9px]') : (isMobile ? 'text-[10px]' : 'text-[10px] sm:text-xs')}`}>{symbol}</span>
      </div>
    </div>
  );
}

export default memo(Card);

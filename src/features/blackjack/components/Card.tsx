'use client';

import { useLayoutEffect, useRef } from 'react';

import { Card as CardType, suitSymbol, suitColor } from '@/features/blackjack/lib/blackjack';

interface CardProps {
  card: CardType;
  index?: number;
  small?: boolean;
  animated?: boolean;
  animationType?: 'slide' | 'drop';
}

export default function Card({ card, index = 0, small = false, animated = true, animationType = 'slide' }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const w = small ? 'w-13 h-[72px]' : 'w-[76px] h-[106px]';
  const textSize = small ? 'text-[11px]' : 'text-base';
  
  useLayoutEffect(() => {
    if (!animated || !cardRef.current || animationType !== 'slide') return;
    
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
        className={`${w} rounded-xl border-[3px] border-red-800 shadow-xl flex items-center justify-center relative shrink-0 overflow-hidden ${animClass}`}
        style={{
          background: '#8B0000',
          marginLeft: index > 0 ? (small ? '-10px' : '-14px') : '0',
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
        <div className={`absolute ${small ? 'inset-[4px]' : 'inset-[6px]'} border-[2px] border-yellow-400/25 rounded-lg`} />
        {/* Center emblem */}
        <div className="relative z-10 flex items-center justify-center">
          <span className={`${small ? 'text-lg' : 'text-3xl'} text-yellow-400/40 font-bold`}>♠</span>
        </div>
      </div>
    );
  }

  const color = suitColor(card.suit);
  const symbol = suitSymbol(card.suit);

  return (
    <div
      ref={cardRef}
      className={`${w} bg-white rounded-xl border-[3px] flex flex-col justify-between relative select-none shrink-0 ${animClass}`}
      style={{
        marginLeft: index > 0 ? (small ? '-10px' : '-14px') : '0',
        zIndex: index,
        padding: small ? '3px' : '5px',
        animationDelay: `${index * 0.12}s`,
        animationFillMode: 'backwards',
        borderColor: color === '#ef4444' ? '#fca5a5' : '#94a3b8',
        boxShadow: `0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.6)`,
      }}
    >
      <div className={`${textSize} font-bold leading-none`} style={{ color }}>
        {card.rank}
        <span className={`block ${small ? 'text-[9px]' : 'text-xs'}`}>{symbol}</span>
      </div>
      <div className={`${small ? 'text-xl' : 'text-3xl'} text-center leading-none`} style={{ color, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }}>
        {symbol}
      </div>
      <div
        className={`${textSize} font-bold leading-none self-end rotate-180`}
        style={{ color }}
      >
        {card.rank}
        <span className={`block ${small ? 'text-[9px]' : 'text-xs'}`}>{symbol}</span>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

// ========================
// Money Rain Effect (for Blackjack wins)
// ========================
interface Bill {
  id: number;
  x: number;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
  emoji: string;
}

const MONEY_EMOJIS = ['💵', '💰', '🤑', '💎', '⭐', '🪙'];

function createBills(): Bill[] {
  return Array.from({ length: 50 }, (_, index) => ({
    id: index,
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 1.5 + Math.random() * 1.5,
    rotation: Math.random() * 720 - 360,
    size: 0.7 + Math.random() * 0.6,
    emoji: MONEY_EMOJIS[Math.floor(Math.random() * MONEY_EMOJIS.length)],
  }));
}

export function MoneyRain({ active }: { active: boolean }) {
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBills(active ? createBills() : []);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active || bills.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {bills.map((bill) => (
        <div
          key={bill.id}
          className="absolute animate-money-fall"
          style={{
            left: `${bill.x}%`,
            animationDelay: `${bill.delay}s`,
            animationDuration: `${bill.duration}s`,
            transform: `scale(${bill.size}) rotate(${bill.rotation}deg)`,
            fontSize: `${24 + bill.size * 12}px`,
          }}
        >
          <div
            style={{
              animationName: 'moneyRotate',
              animationDuration: `${bill.duration * 0.5}s`,
              animationDelay: `${bill.delay}s`,
              animationIterationCount: 'infinite',
              animationTimingFunction: 'linear',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            }}
          >
            {bill.emoji}
          </div>
        </div>
      ))}
    </div>
  );
}

// ========================
// Bust / Lose Vignette Effect
// ========================
export function LoseVignette({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[99] animate-shake">
      <div
        className="w-full h-full"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(180,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)',
          animation: 'vignetteFlash 0.6s ease-out',
        }}
      />
    </div>
  );
}

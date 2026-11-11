'use client';

import { useEffect, useState } from 'react';

// ========================
// Casino Token / Confetti Effect (for Blackjack wins)
// ========================
interface Bill {
  id: number;
  x: number;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
  symbol: string;
  color: string;
}

const CASINO_TOKENS = [
  { symbol: '♠', color: '#f3e6b3' },
  { symbol: '♦', color: '#f59e0b' },
  { symbol: '♣', color: '#6ee7b7' },
  { symbol: '♥', color: '#fbbf24' },
  { symbol: '$', color: '#fde68a' },
];

function createBills(): Bill[] {
  return Array.from({ length: 24 }, (_, index) => {
    const token = CASINO_TOKENS[index % CASINO_TOKENS.length];
    return {
      id: index,
      x: 5 + Math.random() * 90,
      delay: Math.random() * 1.1,
      duration: 1.5 + Math.random() * 1.2,
      rotation: Math.random() * 360 - 180,
      size: 0.75 + Math.random() * 0.45,
      symbol: token.symbol,
      color: token.color,
    };
  });
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
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      {bills.map((bill) => (
        <div
          key={bill.id}
          className="absolute animate-money-fall"
          style={{
            left: `${bill.x}%`,
            animationDelay: `${bill.delay}s`,
            animationDuration: `${bill.duration}s`,
            transform: `scale(${bill.size}) rotate(${bill.rotation}deg)`,
          }}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full border border-yellow-300/60 bg-[#0c2d1c]/90 font-black shadow-md"
            style={{
              color: bill.color,
              fontSize: '14px',
              animationName: 'moneyRotate',
              animationDuration: `${bill.duration * 0.6}s`,
              animationDelay: `${bill.delay}s`,
              animationIterationCount: 'infinite',
              animationTimingFunction: 'linear',
            }}
          >
            {bill.symbol}
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

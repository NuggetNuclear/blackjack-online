'use client';

interface ChipProps {
  value: number;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  animIndex?: number;
}

const CHIP_COLORS: Record<number, { bg: string; border: string; text: string; ring: string }> = {
  1: { bg: '#e5e7eb', border: '#9ca3af', text: '#111827', ring: '#ffffff' },
  5: { bg: '#ef4444', border: '#991b1b', text: 'white', ring: '#fca5a5' },
  25: { bg: '#22c55e', border: '#166534', text: 'white', ring: '#86efac' },
  100: { bg: '#3b82f6', border: '#1e40af', text: 'white', ring: '#93c5fd' },
  500: { bg: '#a855f7', border: '#6b21a8', text: 'white', ring: '#c4b5fd' },
  5000: { bg: '#f59e0b', border: '#92400e', text: '#1a1a1a', ring: '#fde68a' },
};

export default function Chip({ value, selected, onClick, disabled, size = 'md', animated = false, animIndex = 0 }: ChipProps) {
  const colors = CHIP_COLORS[value] || CHIP_COLORS[5];
  const sizeClasses = {
    sm: 'w-10 h-10 text-[9px]',
    md: 'w-12 h-12 text-[11px] sm:w-[58px] sm:h-[58px] sm:text-xs',
    lg: 'w-16 h-16 text-xs sm:w-20 sm:h-20 sm:text-sm',
  };

  const label = value >= 1000 ? `${value / 1000}K` : `$${value}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${sizeClasses[size]} rounded-full font-bold flex items-center justify-center
        border-[3px] sm:border-[4px] transition-all duration-100 relative tabular-nums shrink-0
        ${selected ? 'scale-110 ring-3 ring-offset-2 ring-offset-green-900' : ''}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110 active:scale-95'}
        ${animated ? 'animate-chip-slide' : ''}
      `}
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.text,
        boxShadow: selected
          ? `0 0 16px ${colors.ring}, 0 4px 0 ${colors.border}`
          : `0 4px 0 ${colors.border}, 0 6px 12px rgba(0,0,0,0.4)`,
        ...(animated ? { animationDelay: `${animIndex * 0.08}s`, animationFillMode: 'backwards' } : {}),
      }}
    >
      {/* Edge notch pattern */}
      <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
        style={{
          background: `repeating-conic-gradient(${colors.ring}90 0deg 12deg, transparent 12deg 24deg)`,
          mask: 'radial-gradient(circle, transparent 55%, black 55%, black 80%, transparent 80%)',
          WebkitMask: 'radial-gradient(circle, transparent 55%, black 55%, black 80%, transparent 80%)',
        }} />
      {/* Inner ring */}
      <span className="absolute inset-[5px] sm:inset-[7px] rounded-full border-[1.5px] sm:border-[2px] flex items-center justify-center"
        style={{ borderColor: `${colors.ring}70` }}>
        <span className="font-bold text-outline-sm">{label}</span>
      </span>
    </button>
  );
}

export function ChipStack({ total, small = false }: { total: number; small?: boolean }) {
  if (total <= 0) return null;

  const counts: Record<number, number> = {};
  let remaining = total;
  const denoms = [5000, 500, 100, 25, 5, 1];

  for (const d of denoms) {
    const count = Math.floor(remaining / d);
    if (count > 0) {
      counts[d] = count;
      remaining %= d;
    }
  }

  const activeDenoms = Object.keys(counts).map(Number).sort((a, b) => b - a);
  const stackSpacing = small ? 'gap-0.5' : 'gap-1.5';

  return (
    <div className="relative flex flex-col items-center mt-1 sm:mt-1.5 w-full">
      <div className={`relative flex items-end justify-center ${stackSpacing}`}>
        {activeDenoms.map((denom, stackIdx) => {
          const count = counts[denom];
          const displayCount = Math.min(count, 6); // Max 6 chips high visually per stack
          const sz = small ? 'w-5 h-5 text-[5px]' : 'w-6 h-6 sm:w-7 sm:h-7 text-[6px]';
          const heightBase = small ? 20 : 24;
          const stackHeight = heightBase + (displayCount - 1) * 2.5;
          const c = CHIP_COLORS[denom] || CHIP_COLORS[5];

          return (
            <div key={denom} className="relative flex flex-col items-center" style={{ height: stackHeight, width: heightBase }}>
              {Array.from({ length: displayCount }).map((_, i) => (
                <div
                  key={i}
                  className={`${sz} rounded-full border-[2px] font-bold flex items-center justify-center absolute animate-chip-slide`}
                  style={{
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    color: c.text,
                    bottom: `${i * 2.5}px`,
                    zIndex: i,
                    boxShadow: `0 1px 0 ${c.border}, 0 2px 4px rgba(0,0,0,0.4)`,
                    animationDelay: `${(stackIdx * 3 + i) * 0.04}s`,
                    animationFillMode: 'backwards',
                  }}
                />
              ))}
              {/* Show total count badge if more than 1 chip */}
              {count > 1 && (
                <div className="absolute -top-2.5 bg-black/80 text-white rounded px-1 text-[8px] font-bold z-50 animate-fade-in tabular-nums"
                  style={{ animationDelay: `${(stackIdx * 3 + displayCount) * 0.04}s`, animationFillMode: 'both' }}>
                  x{count}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-yellow-300 text-[10px] sm:text-[11px] font-bold mt-0.5 text-outline-sm whitespace-nowrap tabular-nums">
        ${total.toLocaleString()}
      </span>
    </div>
  );
}

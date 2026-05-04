'use client';

import type { ReactNode } from 'react';

interface RoundTimerFrameProps {
  progress: number;
  children: ReactNode;
  rx?: number | string;
  ry?: number | string;
  padding?: string;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Wraps a button/element with an animated progress border that follows
 * the component's rounded contour using an SVG rounded-rect stroke.
 */
export default function RoundTimerFrame({ progress, children, rx = 22, ry = 22, padding = '' }: RoundTimerFrameProps) {
  const value = clamp(progress);

  // The perimeter of the rounded rect. We use a large reference value and
  // let the SVG viewBox / preserveAspectRatio handle sizing. The exact
  // perimeter depends on the rendered size, but stroke-dasharray with a
  // large-enough value works because the path just wraps.
  // We use 400 as an approximate perimeter for a rect at 100%×100% with rx=30.
  const perimeter = 400;
  const dashOffset = perimeter * (1 - value);

  return (
    <div className={`relative inline-flex items-center justify-center ${padding}`}>
      {/* SVG border that follows the rounded contour */}
      <svg
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        viewBox="0 0 120 50"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background track (subtle border) */}
        <rect
          x="1.5" y="1.5" width="117" height="47"
          rx={rx} ry={ry}
          stroke="rgba(253, 224, 71, 0.12)"
          strokeWidth="2.5"
          fill="none"
        />
        {/* Animated progress stroke */}
        <rect
          x="1.5" y="1.5" width="117" height="47"
          rx={rx} ry={ry}
          stroke="url(#timerGradient)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={perimeter}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 100ms linear' }}
        />
        <defs>
          <linearGradient id="timerGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      </svg>
      {/* Glow effect when progress > 0 */}
      {value > 0 && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[1.9rem]"
          style={{
            boxShadow: `0 0 ${8 + value * 12}px rgba(253, 224, 71, ${0.1 + value * 0.2})`,
            transition: 'box-shadow 100ms linear',
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

import type { CSSProperties } from 'react';

/** Shared furniture for the entry, waiting room and live table. No game state. */
export default function TableSurface({ bottomInset = 36 }: { bottomInset?: number }) {
  return (
    <div className="casino-surface" aria-hidden="true" style={{ '--table-bottom': `${bottomInset}px` } as CSSProperties}>
      <div className="casino-surface__floor" />
      <div className="casino-surface__rim" />
      <div className="casino-surface__felt" />
    </div>
  );
}

export default function CasinoBrand({ heading = false, compact = false }: { heading?: boolean; compact?: boolean }) {
  const Name = heading ? 'h1' : 'span';
  return (
    <div className={`casino-brand${compact ? ' casino-brand--compact' : ''}`}>
      <span className="casino-brand__card" aria-hidden="true"><span>A</span><span>♠</span></span>
      <Name className="casino-brand__name">Blackjack Online</Name>
    </div>
  );
}

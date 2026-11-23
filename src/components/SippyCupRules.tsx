export function SippyCupRules({ par }: { par: number }) {
  return (
    <div className="mt-4 space-y-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
      <p>Handicaps are capped at 18 for scoring. No mulligans on the green or with a putter.</p>
      {par === 5 && (
        <p>Choose the two best drives. Two players play from each drive. The player who hit the best drive can play from either.</p>
      )}
    </div>
  );
}

interface MoveCounterProps {
  currentMove: number;
  totalMoves: number;
}

export default function MoveCounter({ currentMove, totalMoves }: MoveCounterProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <span className="font-mono">
        {currentMove} / {totalMoves}
      </span>
    </div>
  );
}

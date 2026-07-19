import { X } from 'lucide-react';
import GoBoard, { type BoardState, type StoneColor } from './GoBoard';

interface ZoomTapConfirmProps {
  boardState: BoardState;
  boardSize: number;
  x: number;
  y: number;
  color: StoneColor;
  onConfirm: (x: number, y: number) => void;
  onCancel: () => void;
}

/**
 * スマホのタップミス対策: 1回目タップした周辺を拡大表示し、
 * その中で再タップした座標をそのまま着手として採用する（1回目の座標には固定しない）。
 * これにより拡大された当たり判定で指を置き直して狙いを微調整できる。
 */
export default function ZoomTapConfirm({ boardState, boardSize, x, y, color, onConfirm, onCancel }: ZoomTapConfirmProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="glass-panel p-4 w-[92vmin] h-[92vmin] max-w-[440px] max-h-[440px] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0">
          <span className="text-sm text-zinc-400">タップして着手を確定</span>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <GoBoard
            boardState={boardState}
            boardSize={boardSize}
            viewRange={{ minX: x - 1, maxX: x + 1, minY: y - 1, maxY: y + 1 }}
            ghostPosition={{ x, y }}
            ghostColor={color}
            onCellClick={onConfirm}
            maxHeight="80vmin"
          />
        </div>
      </div>
    </div>
  );
}

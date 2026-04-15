import GameBoard from '../GameBoard';
import type { Student } from '../../types/classroom';

interface GameObserverPanelProps {
  gameId: string;
  students?: Student[];
  localIdentity: string;
  onBack: () => void;
}

export default function GameObserverPanel({
  gameId,
  localIdentity,
  onBack,
}: GameObserverPanelProps) {
  return (
    <div style={{ padding: 8, background: '#d0d0c8', minHeight: '100%' }}>
      <GameBoard
        gameId={gameId}
        myIdentity={localIdentity}
        isTeacher
        onBack={onBack}
      />
    </div>
  );
}

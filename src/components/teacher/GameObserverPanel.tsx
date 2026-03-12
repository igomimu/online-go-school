import GoBoard from '../GoBoard';
import type { GameSession } from '../../types/game';
import type { StoneColor } from '../GoBoard';
import type { Student } from '../../types/classroom';
import { getDisplayName } from '../../utils/identityUtils';
import { formatTime } from '../../hooks/useGameClock';

interface GameObserverPanelProps {
  game: GameSession;
  students: Student[];
  localIdentity: string;
  onMove: (gameId: string, x: number, y: number, color: StoneColor) => void;
  onPass: (gameId: string, color: StoneColor) => void;
  onResign: (gameId: string, color: StoneColor) => void;
  onBack: () => void;
}

export default function GameObserverPanel({
  game,
  students,
  localIdentity: _localIdentity,
  onMove,
  onPass,
  onResign,
  onBack,
}: GameObserverPanelProps) {
  const blackName = getDisplayName(game.blackPlayer, students);
  const whiteName = getDisplayName(game.whitePlayer, students);
  const isPlaying = game.status === 'playing';

  const handleCellClick = (x: number, y: number) => {
    if (!isPlaying) return;
    onMove(game.id, x, y, game.currentColor);
  };

  const handlePass = () => {
    if (!isPlaying) return;
    onPass(game.id, game.currentColor);
  };

  const handleResign = () => {
    if (!isPlaying) return;
    const side = game.currentColor === 'BLACK' ? blackName : whiteName;
    if (confirm(`${side}を投了させますか？`)) {
      onResign(game.id, game.currentColor);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#d0d0c8',
      fontFamily: 'MS Gothic, monospace',
      fontSize: 12,
    }}>
      {/* ヘッダー: 対局情報 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        background: '#3030a0',
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
      }}>
        <button
          onClick={onBack}
          style={{
            background: '#d0d0c8',
            color: '#333',
            border: '1px solid #666',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          ← 一覧
        </button>
        <span>● {blackName}</span>
        <span style={{ color: '#aaa' }}>vs</span>
        <span>○ {whiteName}</span>
        <span style={{ color: '#ffff00', marginLeft: 'auto' }}>
          {isPlaying
            ? `${game.moveNumber}手目 ${game.currentColor === 'BLACK' ? '黒番' : '白番'}`
            : `終局: ${game.result}`}
        </span>
      </div>

      {/* 碁盤 + サイドパネル */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 4, gap: 4 }}>
        {/* 碁盤 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{ maxWidth: '100%', maxHeight: '100%' }}>
            <GoBoard
              boardState={game.boardState}
              boardSize={game.boardSize}
              onCellClick={isPlaying ? handleCellClick : undefined}
              readOnly={!isPlaying}
            />
          </div>
        </div>

        {/* 右: 対局情報パネル */}
        <div style={{
          width: 160,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 11,
        }}>
          {/* 対局者情報 */}
          <div style={{
            background: '#fff',
            border: '1px solid #999',
            padding: 6,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>対局情報</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                background: '#000', display: 'inline-block', border: '1px solid #666',
              }} />
              <span style={{ fontWeight: game.currentColor === 'BLACK' ? 'bold' : 'normal' }}>
                {blackName}
              </span>
            </div>
            <div style={{ paddingLeft: 16, color: '#666', marginBottom: 4 }}>
              取石: {game.blackCaptures}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                background: '#fff', display: 'inline-block', border: '1px solid #666',
              }} />
              <span style={{ fontWeight: game.currentColor === 'WHITE' ? 'bold' : 'normal' }}>
                {whiteName}
              </span>
            </div>
            <div style={{ paddingLeft: 16, color: '#666' }}>
              取石: {game.whiteCaptures}
            </div>
            {/* 時計 */}
            {game.clock && (
              <div style={{ marginTop: 6, borderTop: '1px solid #ddd', paddingTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>● 残</span>
                  <span style={{
                    fontWeight: 'bold',
                    color: game.clock.blackTimeLeft <= 30 ? '#cc0000' : '#333',
                    fontFamily: 'monospace',
                  }}>
                    {formatTime(game.clock.blackTimeLeft)}
                    {game.clock.byoyomiPeriods > 0 && (
                      <span style={{ fontSize: 10, color: '#666' }}> ({game.clock.blackByoyomiLeft})</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>○ 残</span>
                  <span style={{
                    fontWeight: 'bold',
                    color: game.clock.whiteTimeLeft <= 30 ? '#cc0000' : '#333',
                    fontFamily: 'monospace',
                  }}>
                    {formatTime(game.clock.whiteTimeLeft)}
                    {game.clock.byoyomiPeriods > 0 && (
                      <span style={{ fontSize: 10, color: '#666' }}> ({game.clock.whiteByoyomiLeft})</span>
                    )}
                  </span>
                </div>
              </div>
            )}
            <div style={{ marginTop: 6, borderTop: '1px solid #ddd', paddingTop: 4, color: '#666' }}>
              盤: {game.boardSize}路 / 置石: {game.handicap} / コミ: {game.komi}
            </div>
          </div>

          {/* 操作ボタン */}
          {isPlaying && (
            <div style={{
              background: '#f0f0e8',
              border: '1px solid #999',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>先生操作</div>
              <button
                onClick={handlePass}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #666',
                  background: '#d0d0c8',
                  cursor: 'pointer',
                  fontSize: 11,
                  width: '100%',
                }}
              >
                パス（{game.currentColor === 'BLACK' ? '黒' : '白'}）
              </button>
              <button
                onClick={handleResign}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #666',
                  background: '#f0c0c0',
                  cursor: 'pointer',
                  fontSize: 11,
                  width: '100%',
                }}
              >
                投了（{game.currentColor === 'BLACK' ? '黒' : '白'}）
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

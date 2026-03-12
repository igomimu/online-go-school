import { useState, useEffect } from 'react';
import type { Student } from '../../types/classroom';
import { rankToNumber, suggestHandicap } from '../../types/classroom';
import { findStudentByIdentity, getDisplayName } from '../../utils/identityUtils';

interface PairingPair {
  blackIdentity: string;
  whiteIdentity: string;
  blackName: string;
  whiteName: string;
  blackRank: string;
  whiteRank: string;
  handicap: number;
  komi: number;
  boardSize: number;
}

interface AutoPairingDialogProps {
  connectedIdentities: string[];
  students: Student[];
  teacherIdentity: string;
  onClose: () => void;
  onCreateGames: (pairs: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
  }[]) => void;
}

// 棋力が近い者同士をペアリング
function autoPair(
  identities: string[],
  students: Student[],
): PairingPair[] {
  // 棋力数値でソート（強い順）
  const sorted = [...identities].sort((a, b) => {
    const sA = findStudentByIdentity(a, students);
    const sB = findStudentByIdentity(b, students);
    const rA = rankToNumber(sA?.rank || '');
    const rB = rankToNumber(sB?.rank || '');
    return rB - rA; // 強い順
  });

  const pairs: PairingPair[] = [];

  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const strongId = sorted[i];
    const weakId = sorted[i + 1];
    const strongStudent = findStudentByIdentity(strongId, students);
    const weakStudent = findStudentByIdentity(weakId, students);
    const strongRank = strongStudent?.rank || '';
    const weakRank = weakStudent?.rank || '';

    // 弱い方が黒（置き石を持つ）
    const suggestion = suggestHandicap(weakRank, strongRank);

    pairs.push({
      blackIdentity: weakId,
      whiteIdentity: strongId,
      blackName: getDisplayName(weakId, students),
      whiteName: getDisplayName(strongId, students),
      blackRank: weakRank,
      whiteRank: strongRank,
      handicap: suggestion.handicap,
      komi: suggestion.komi,
      boardSize: 19,
    });
  }

  // 奇数人の場合、最後の1人は余り
  return pairs;
}

export default function AutoPairingDialog({
  connectedIdentities,
  students,
  teacherIdentity,
  onClose,
  onCreateGames,
}: AutoPairingDialogProps) {
  const studentIdentities = connectedIdentities.filter(id => id !== teacherIdentity);
  const [pairs, setPairs] = useState<PairingPair[]>([]);
  const [unpairedIdentity, setUnpairedIdentity] = useState<string | null>(null);

  useEffect(() => {
    const result = autoPair(studentIdentities, students);
    setPairs(result);
    // 奇数人なら最後の1人が余り
    if (studentIdentities.length % 2 === 1) {
      setUnpairedIdentity(studentIdentities[studentIdentities.length - 1]);
    } else {
      setUnpairedIdentity(null);
    }
  }, []);

  // 黒白入れ替え
  const swapColors = (index: number) => {
    setPairs(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const suggestion = suggestHandicap(p.whiteRank, p.blackRank);
      return {
        ...p,
        blackIdentity: p.whiteIdentity,
        whiteIdentity: p.blackIdentity,
        blackName: p.whiteName,
        whiteName: p.blackName,
        blackRank: p.whiteRank,
        whiteRank: p.blackRank,
        handicap: suggestion.handicap,
        komi: suggestion.komi,
      };
    }));
  };

  // 碁盤サイズ変更
  const changeBoardSize = (index: number, size: number) => {
    setPairs(prev => prev.map((p, i) => i === index ? { ...p, boardSize: size } : p));
  };

  // 置き石手動変更
  const changeHandicap = (index: number, handicap: number) => {
    setPairs(prev => prev.map((p, i) => i === index ? {
      ...p,
      handicap,
      komi: handicap >= 2 ? 0.5 : 6.5,
    } : p));
  };

  // ペアを削除
  const removePair = (index: number) => {
    setPairs(prev => prev.filter((_, i) => i !== index));
  };

  // 一括開始
  const handleStart = () => {
    onCreateGames(pairs.map(p => ({
      blackPlayer: p.blackIdentity,
      whitePlayer: p.whiteIdentity,
      boardSize: p.boardSize,
      handicap: p.handicap,
      komi: p.komi,
    })));
    onClose();
  };

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: '1px solid #ccc',
    fontSize: 11,
    textAlign: 'center',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#e8e8e0', border: '2px solid #666', padding: 0,
        width: 750, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        fontFamily: 'MS Gothic, monospace', fontSize: 12,
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 10px', background: '#3030a0', color: 'white', fontWeight: 'bold', fontSize: 13,
        }}>
          自動ペアリング（{studentIdentities.length}名）
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer',
          }}>&times;</button>
        </div>

        {/* ペア一覧 */}
        <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
          {pairs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#666' }}>
              接続中の生徒が2名以上必要です
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#d0d0c8' }}>
                  <th style={{ ...cellStyle, width: 30 }}>No</th>
                  <th style={cellStyle}>黒番（弱い方）</th>
                  <th style={{ ...cellStyle, width: 36 }}>棋力</th>
                  <th style={{ ...cellStyle, width: 30 }}></th>
                  <th style={cellStyle}>白番（強い方）</th>
                  <th style={{ ...cellStyle, width: 36 }}>棋力</th>
                  <th style={{ ...cellStyle, width: 36 }}>置石</th>
                  <th style={{ ...cellStyle, width: 42 }}>コミ</th>
                  <th style={{ ...cellStyle, width: 40 }}>盤</th>
                  <th style={{ ...cellStyle, width: 60 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8f8f0' }}>
                    <td style={cellStyle}>{i + 1}</td>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold' }}>
                      ● {p.blackName}
                    </td>
                    <td style={{ ...cellStyle, color: '#cc6600' }}>{p.blackRank || '?'}</td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => swapColors(i)}
                        title="黒白入替"
                        style={{
                          border: '1px solid #999', background: '#e0e0d8',
                          cursor: 'pointer', fontSize: 11, padding: '1px 4px',
                        }}
                      >⇄</button>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold' }}>
                      ○ {p.whiteName}
                    </td>
                    <td style={{ ...cellStyle, color: '#cc6600' }}>{p.whiteRank || '?'}</td>
                    <td style={cellStyle}>
                      <select
                        value={p.handicap}
                        onChange={e => changeHandicap(i, Number(e.target.value))}
                        style={{ width: 32, fontSize: 11, border: '1px solid #999' }}
                      >
                        {Array.from({ length: 10 }, (_, n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </td>
                    <td style={cellStyle}>{p.komi}</td>
                    <td style={cellStyle}>
                      <select
                        value={p.boardSize}
                        onChange={e => changeBoardSize(i, Number(e.target.value))}
                        style={{ width: 36, fontSize: 11, border: '1px solid #999' }}
                      >
                        <option value={19}>19</option>
                        <option value={13}>13</option>
                        <option value={9}>9</option>
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => removePair(i)}
                        style={{
                          border: '1px solid #999', background: '#f0c0c0',
                          cursor: 'pointer', fontSize: 10, padding: '1px 6px',
                        }}
                      >削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 余った生徒 */}
          {unpairedIdentity && (
            <div style={{
              marginTop: 8, padding: '4px 8px',
              background: '#fff8e0', border: '1px solid #cc9',
              fontSize: 11, color: '#886600',
            }}>
              ペアなし: {getDisplayName(unpairedIdentity, students)}
              （奇数のため先生と対局するか、見学になります）
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{
          padding: '8px 12px', borderTop: '1px solid #999',
          display: 'flex', justifyContent: 'center', gap: 12, background: '#d0d0c8',
        }}>
          <button
            onClick={handleStart}
            disabled={pairs.length === 0}
            style={{
              padding: '6px 32px', fontSize: 13, fontWeight: 'bold',
              border: '1px solid #333', cursor: pairs.length > 0 ? 'pointer' : 'default',
              background: pairs.length > 0 ? '#60a060' : '#ccc',
              color: 'white',
            }}
          >
            {pairs.length}局を一括開始
          </button>
          <button onClick={onClose} style={{
            padding: '6px 32px', fontSize: 13, fontWeight: 'bold',
            border: '1px solid #666', background: '#d0d0c8', cursor: 'pointer',
          }}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

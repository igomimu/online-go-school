import { useState } from 'react';
import type { Student } from '../../types/classroom';
import type { GameClock } from '../../types/game';
import { rankToNumber, suggestHandicap } from '../../types/classroom';
import type { TimeSettings } from '../../hooks/useGameClock';
import { DEFAULT_TIME_SETTINGS, timeSettingsToClock } from '../../hooks/useGameClock';
import { findStudentByIdentity, getDisplayName } from '../../utils/identityUtils';
import TimeControlPicker from '../TimeControlPicker';

/**
 * 手合割。互先 → 定先 → 2子 … の順（対局作成ダイアログと同じ並び 2026-08-05）。
 * 定先は置石ゼロ・コミ半目なので、置石の数だけでは互先と区別できない。
 * 表の枠が狭いので、ラベルは「互」「先」と数字だけにしている。
 */
const HANDICAP_CHOICES: { key: string; label: string; handicap: number; komi: number }[] = [
  { key: 'even', label: '互', handicap: 0, komi: 6.5 },
  { key: 'sen', label: '先', handicap: 0, komi: 0.5 },
  // 1子は意味をなさないため選択肢から除く
  ...[2, 3, 4, 5, 6, 7, 8, 9].map(h => ({ key: String(h), label: String(h), handicap: h, komi: 0.5 })),
];

/** 今の置石・コミがどの手合割にあたるか */
function handicapKeyOf(handicap: number, komi: number): string {
  if (handicap > 0) return String(handicap);
  return komi >= 1 ? 'even' : 'sen';
}

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
    clock?: GameClock;
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
  const [pairs, setPairs] = useState<PairingPair[]>(() => autoPair(studentIdentities, students));
  const [unpairedIdentity] = useState<string | null>(() => (
    studentIdentities.length % 2 === 1
      ? studentIdentities[studentIdentities.length - 1]
      : null
  ));
  const [timeSettings, setTimeSettings] = useState<TimeSettings>(DEFAULT_TIME_SETTINGS); // 全対局共通

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

  // 手合割の手動変更（コミも一緒に決まる）
  const changeHandicap = (index: number, key: string) => {
    const choice = HANDICAP_CHOICES.find(c => c.key === key);
    if (!choice) return;
    setPairs(prev => prev.map((p, i) => i === index ? {
      ...p,
      handicap: choice.handicap,
      komi: choice.komi,
    } : p));
  };

  // ペアを削除
  const removePair = (index: number) => {
    setPairs(prev => prev.filter((_, i) => i !== index));
  };

  // 一括開始
  const handleStart = () => {
    const clock = timeSettingsToClock(timeSettings);
    onCreateGames(pairs.map(p => ({
      blackPlayer: p.blackIdentity,
      whitePlayer: p.whiteIdentity,
      boardSize: p.boardSize,
      handicap: p.handicap,
      komi: p.komi,
      clock,
    })));
    onClose();
  };

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: '1px solid var(--color-line)',
    fontSize: 11,
    textAlign: 'center',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-line)', padding: 0,
        width: 750, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        fontSize: 12,
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 10px', background: 'var(--color-raised)', color: 'var(--color-ink)', fontWeight: 'bold', fontSize: 13,
        }}>
          自動ペアリング（{studentIdentities.length}名）
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--color-ink)', fontSize: 18, cursor: 'pointer',
          }}>&times;</button>
        </div>

        {/* ペア一覧 */}
        <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
          {pairs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
              接続中の生徒が2名以上必要です
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-raised)' }}>
                  <th style={{ ...cellStyle, width: 30 }}>No</th>
                  <th style={cellStyle}>黒番（弱い方）</th>
                  <th style={{ ...cellStyle, width: 36 }}>棋力</th>
                  <th style={{ ...cellStyle, width: 30 }}></th>
                  <th style={cellStyle}>白番（強い方）</th>
                  <th style={{ ...cellStyle, width: 36 }}>棋力</th>
                  <th style={{ ...cellStyle, width: 40 }}>手合</th>
                  <th style={{ ...cellStyle, width: 42 }}>コミ</th>
                  <th style={{ ...cellStyle, width: 40 }}>盤</th>
                  <th style={{ ...cellStyle, width: 60 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--color-ground)' : 'var(--color-surface)' }}>
                    <td style={cellStyle}>{i + 1}</td>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold' }}>
                      ● {p.blackName}
                    </td>
                    <td style={{ ...cellStyle, color: 'var(--color-accent-text)' }}>{p.blackRank || '?'}</td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => swapColors(i)}
                        title="黒白入替"
                        style={{
                          border: '1px solid var(--color-line)', background: 'var(--color-raised)',
                          cursor: 'pointer', fontSize: 11, padding: '1px 4px',
                        }}
                      >⇄</button>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold' }}>
                      ○ {p.whiteName}
                    </td>
                    <td style={{ ...cellStyle, color: 'var(--color-accent-text)' }}>{p.whiteRank || '?'}</td>
                    <td style={cellStyle}>
                      <select
                        value={handicapKeyOf(p.handicap, p.komi)}
                        onChange={e => changeHandicap(i, e.target.value)}
                        style={{ width: 36, fontSize: 11, border: '1px solid var(--color-line)' }}
                      >
                        {HANDICAP_CHOICES.map(c => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={cellStyle}>{p.komi}</td>
                    <td style={cellStyle}>
                      <select
                        value={p.boardSize}
                        onChange={e => changeBoardSize(i, Number(e.target.value))}
                        style={{ width: 36, fontSize: 11, border: '1px solid var(--color-line)' }}
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
                          border: '1px solid var(--color-line)', background: 'color-mix(in oklab, var(--color-alert) 18%, var(--color-surface))',
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
              background: 'color-mix(in oklab, var(--color-accent) 12%, var(--color-surface))', border: '1px solid var(--color-line)',
              fontSize: 11, color: 'var(--color-accent-text)',
            }}>
              ペアなし: {getDisplayName(unpairedIdentity, students)}
              （奇数のため先生と対局するか、見学になります）
            </div>
          )}
        </div>

        {/* 持ち時間設定（全対局共通・項目ごとに自由設定） */}
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--color-line)',
          background: 'var(--color-surface)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4, color: 'var(--color-ink)' }}>対局時計（全対局共通）</div>
          <TimeControlPicker variant="light" value={timeSettings} onChange={setTimeSettings} />
        </div>

        {/* フッター */}
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--color-line)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, background: 'var(--color-raised)',
        }}>
          <button
            onClick={handleStart}
            disabled={pairs.length === 0}
            style={{
              padding: '6px 32px', fontSize: 13, fontWeight: 'bold',
              border: '1px solid var(--color-line)', cursor: pairs.length > 0 ? 'pointer' : 'default',
              background: pairs.length > 0 ? 'var(--color-accent)' : 'var(--color-line)',
              color: pairs.length > 0 ? 'var(--color-ground)' : 'var(--color-muted)',
            }}
          >
            {pairs.length}局を一括開始
          </button>
          <button onClick={onClose} style={{
            padding: '6px 32px', fontSize: 13, fontWeight: 'bold',
            border: '1px solid var(--color-line)', background: 'var(--color-raised)', cursor: 'pointer',
          }}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

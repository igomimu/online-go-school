import { useCallback, useRef, useState } from 'react';

export interface ParticipantLogEntry {
  /**
   * React の key 用。時刻では作れない — 回線が切れて即座に繋ぎ直すと出入りが同じ
   * ミリ秒に収まり、key が衝突して行が描き分けられなくなる。連番で振る。
   */
  key: string;
  identity: string;
  kind: 'join' | 'leave';
  at: Date;
}

/**
 * 教室への出入りを控えておく。
 *
 * 教室ホームには「いま繋がっている人」の一覧が既にあるが、それは状態しか映さないので、
 * 対局や検討をしている間に誰が来たのかが分からない。ここに時間軸を足す。
 *
 * 記録は LiveKit の onParticipantJoined / onParticipantLeft から呼ぶ。participants 配列の
 * 差分を見る手もあるが、それだと自分が入室した瞬間に既に居た人が全員「来ました」になる。
 *
 * App で呼ぶこと。教室ホームで呼ぶと、対局に入った時点で Lobby ごと消えて履歴が失われる。
 *
 * @param limit 保持する件数（表示するのはこのうち数件）
 */
export function useParticipantLog(limit = 20) {
  const seq = useRef(0);
  const [log, setLog] = useState<ParticipantLogEntry[]>([]);

  const record = useCallback((identity: string, kind: 'join' | 'leave') => {
    const entry: ParticipantLogEntry = {
      key: `${identity}-${kind}-${++seq.current}`,
      identity,
      kind,
      at: new Date(),
    };
    setLog(prev => [...prev, entry].slice(-limit));
  }, [limit]);

  return { log, record };
}

import { describe, expect, it } from 'vitest';
import { selectDuplicateStudentPeersToKick } from './realtimeParticipantDedup';

describe('selectDuplicateStudentPeersToKick', () => {
  it('同じ生徒の新しい接続を残して古い接続を選ぶ', () => {
    const oldPeer = { id: 'peer-old', customParticipantId: 'sid:1001', name: '影山 陽翔' };
    const newPeer = { id: 'peer-new', customParticipantId: 'sid:1001', name: '影山 陽翔' };

    expect(selectDuplicateStudentPeersToKick([oldPeer, newPeer], newPeer.id)).toEqual([oldPeer]);
  });

  it('初回同期では同じ生徒の最後の接続だけを残す', () => {
    const first = { id: 'peer-1', customParticipantId: 'sid:1001' };
    const second = { id: 'peer-2', customParticipantId: 'sid:1001' };
    const latest = { id: 'peer-3', customParticipantId: 'sid:1001' };

    expect(selectDuplicateStudentPeersToKick([first, second, latest])).toEqual([first, second]);
  });

  it('同姓同名でも生徒identityが異なれば切断しない', () => {
    const peers = [
      { id: 'peer-1', customParticipantId: 'sid:1001', name: '同じ 名前' },
      { id: 'peer-2', customParticipantId: 'sid:1002', name: '同じ 名前' },
    ];

    expect(selectDuplicateStudentPeersToKick(peers)).toEqual([]);
  });

  it('先生の複数ウィンドウ接続は切断しない', () => {
    const peers = [
      { id: 'teacher-main', customParticipantId: 'teacher' },
      { id: 'teacher-window', customParticipantId: 'teacher' },
    ];

    expect(selectDuplicateStudentPeersToKick(peers)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildStudentLoginLink, readStudentCodeFromParams } from './studentLoginLink';

describe('生徒の参加リンク', () => {
  it('教室IDと生徒コードを載せたリンクを作る', () => {
    expect(buildStudentLoginLink({
      classroomId: 'CLS20160919347',
      studentCode: '1005',
      baseUrl: 'https://online.mimura15.jp/',
    })).toBe('https://online.mimura15.jp/?classroomId=CLS20160919347&code=1005');
  });

  it('自動入室のパラメータ（role / room）は付けない', () => {
    const link = buildStudentLoginLink({
      classroomId: 'CLS1',
      studentCode: '1005',
      baseUrl: 'https://online.mimura15.jp/',
    });
    expect(link).not.toContain('role=');
    expect(link).not.toContain('room=');
  });

  it('基準URLに既存のクエリが付いていても引き継がない', () => {
    expect(buildStudentLoginLink({
      classroomId: 'CLS1',
      studentCode: '1005',
      baseUrl: 'https://online.mimura15.jp/?code=9999',
    })).toBe('https://online.mimura15.jp/?classroomId=CLS1&code=1005');
  });

  it('前後の空白は落とす', () => {
    expect(buildStudentLoginLink({
      classroomId: ' CLS1 ',
      studentCode: ' 1005 ',
      baseUrl: 'https://x/',
    })).toBe('https://x/?classroomId=CLS1&code=1005');
  });

  it('配布済みの古いリンク（studentCode / studentId）からもコードを読む', () => {
    expect(readStudentCodeFromParams(new URLSearchParams('code=1005'))).toBe('1005');
    expect(readStudentCodeFromParams(new URLSearchParams('studentCode=1006'))).toBe('1006');
    expect(readStudentCodeFromParams(new URLSearchParams('studentId=1007'))).toBe('1007');
    expect(readStudentCodeFromParams(new URLSearchParams('classroomId=CLS1'))).toBeUndefined();
  });
});

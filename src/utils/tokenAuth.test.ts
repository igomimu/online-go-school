import { describe, expect, it } from 'vitest';
import { identityBelongsToStudent } from '../../api/tokenAuth';

describe('identityBelongsToStudent', () => {
  it('sid付きidentityとbare student_idを同一生徒として扱う', () => {
    expect(identityBelongsToStudent('sid:1002', '1002')).toBe(true);
    expect(identityBelongsToStudent('1002', 'sid:1002')).toBe(true);
  });

  it('4桁IDを部分一致で同一生徒扱いしない', () => {
    expect(identityBelongsToStudent('sid:10020', '1002')).toBe(false);
    expect(identityBelongsToStudent('sid:x1002', '1002')).toBe(false);
    expect(identityBelongsToStudent('sid:1002', '10020')).toBe(false);
  });

  it('文字列以外は一致扱いしない', () => {
    expect(identityBelongsToStudent(null, '1002')).toBe(false);
    expect(identityBelongsToStudent('sid:1002', undefined)).toBe(false);
    expect(identityBelongsToStudent({ id: 'sid:1002' }, '1002')).toBe(false);
  });
});

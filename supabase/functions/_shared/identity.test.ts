import { describe, it, expect } from 'vitest';
import { stripSid, toStudentIdentity, studentMatchesPlayer, STUDENT_PREFIX } from './identity';

const UUID = 'd3c90fa1-b1a2-4c3d-8e4f-5a6b7c8d9e0f';
const SID = `${STUDENT_PREFIX}${UUID}`;

describe('stripSid', () => {
  it('sid: prefix を剥がす', () => {
    expect(stripSid(SID)).toBe(UUID);
  });
  it('prefix が無ければそのまま', () => {
    expect(stripSid(UUID)).toBe(UUID);
  });
});

describe('toStudentIdentity', () => {
  it('bare UUID を sid: 形式に正規化', () => {
    expect(toStudentIdentity(UUID)).toBe(SID);
  });
  it('既に sid: 形式なら二重付与しない', () => {
    expect(toStudentIdentity(SID)).toBe(SID);
  });
});

describe('studentMatchesPlayer（中核バグの修正点）', () => {
  it('JWT の bare student_id が DB の sid: 形式 player と一致する', () => {
    // これが false に落ちていたのが「生徒が着手できない」根因だった
    expect(studentMatchesPlayer(UUID, SID)).toBe(true);
  });
  it('sid: 同士でも一致', () => {
    expect(studentMatchesPlayer(SID, SID)).toBe(true);
  });
  it('bare 同士でも一致', () => {
    expect(studentMatchesPlayer(UUID, UUID)).toBe(true);
  });
  it('別人とは一致しない', () => {
    expect(studentMatchesPlayer(UUID, `${STUDENT_PREFIX}e4d01fa2-b2a3-4c4d-9e5f-6a7b8c9d0e1f`)).toBe(false);
  });
  it('null/undefined は不一致', () => {
    expect(studentMatchesPlayer(UUID, null)).toBe(false);
    expect(studentMatchesPlayer(null, SID)).toBe(false);
    expect(studentMatchesPlayer(undefined, undefined)).toBe(false);
  });
});

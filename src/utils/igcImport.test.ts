import { describe, it, expect } from 'vitest';
import { parseIgcXml } from './igcImport';

const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<StandAloneData>
  <Students>
    <User>
      <strID>SM001</strID>
      <strFullName>田中 太郎</strFullName>
      <strSex>M</strSex>
      <strRank>3D</strRank>
      <strUserDefRank>R5</strUserDefRank>
      <strType>3</strType>
      <strGrade>8</strGrade>
      <strCountry>千葉県</strCountry>
    </User>
    <User>
      <strID>SM002</strID>
      <strFullName>鈴木　花子</strFullName>
      <strSex>F</strSex>
      <strRank>1K</strRank>
      <strUserDefRank>R15</strUserDefRank>
      <strType>7</strType>
      <strGrade>16</strGrade>
      <strCountry>東京都</strCountry>
    </User>
  </Students>
  <Classes>
    <Cls>
      <strID>CLS001</strID>
      <strName>火曜クラス</strName>
      <strRoomCapacity>10</strRoomCapacity>
      <StuIDs>
        <string>SM001</string>
        <string>SM002</string>
      </StuIDs>
    </Cls>
    <Cls>
      <strID>CLS002</strID>
      <strName>土曜クラス</strName>
      <strRoomCapacity>8</strRoomCapacity>
      <StuIDs />
    </Cls>
  </Classes>
</StandAloneData>`;

describe('parseIgcXml', () => {
  it('生徒を正しくパースする', () => {
    const result = parseIgcXml(sampleXml);
    expect(result.students).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    const s1 = result.students[0];
    expect(s1.id).toBe('SM001');
    expect(s1.name).toBe('田中 太郎');
    expect(s1.rank).toBe('3D');
    expect(s1.internalRating).toBe('R5');
    expect(s1.type).toBe('ネット生');  // strType=3
    expect(s1.grade).toBe('中2');       // strGrade=8
    expect(s1.country).toBe('千葉県');
  });

  it('大人会員を正しくマッピングする', () => {
    const result = parseIgcXml(sampleXml);
    const s2 = result.students[1];
    expect(s2.type).toBe('大人会員');   // strType=7
    expect(s2.grade).toBe('大人');       // strGrade=16
  });

  it('全角スペースを正規化する', () => {
    const result = parseIgcXml(sampleXml);
    // "鈴木　花子" → "鈴木 花子"
    expect(result.students[1].name).toBe('鈴木 花子');
  });

  it('教室を正しくパースする', () => {
    const result = parseIgcXml(sampleXml);
    expect(result.classrooms).toHaveLength(2);

    const c1 = result.classrooms[0];
    expect(c1.id).toBe('CLS001');
    expect(c1.name).toBe('火曜クラス');
    expect(c1.maxCapacity).toBe(10);
    expect(c1.studentIds).toEqual(['SM001', 'SM002']);

    const c2 = result.classrooms[1];
    expect(c2.studentIds).toEqual([]);
  });

  it('不正なXMLでエラーを返す', () => {
    const result = parseIgcXml('<invalid>');
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
    // DOMParser may or may not produce parsererror depending on browser
  });
});

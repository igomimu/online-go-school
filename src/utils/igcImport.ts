import type { Student, Classroom } from '../types/classroom';
import { STUDENT_TYPE_MAP, gradeToDisplay } from '../types/classroom';

export interface IgcImportResult {
  students: Student[];
  classrooms: Classroom[];
  errors: string[];
}

/**
 * igocampus XML文字列をパースしてStudent/Classroomに変換
 */
export function parseIgcXml(xmlText: string): IgcImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const errors: string[] = [];

  // パースエラーチェック
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return { students: [], classrooms: [], errors: ['XMLのパースに失敗しました'] };
  }

  // === 生徒パース ===
  const students: Student[] = [];
  const userNodes = doc.querySelectorAll('Students > User');

  userNodes.forEach(node => {
    const id = getText(node, 'strID');
    const name = getText(node, 'strFullName');
    if (!id || !name) {
      errors.push(`生徒データが不完全です: ID=${id}`);
      return;
    }

    const typeNum = getText(node, 'strType') || '0';
    const gradeNum = parseInt(getText(node, 'strGrade') || '0');

    students.push({
      id,
      name: name.replace(/\s+/g, ' ').trim(), // 全角スペース正規化
      rank: getText(node, 'strRank') || '',
      internalRating: getText(node, 'strUserDefRank') || '',
      type: STUDENT_TYPE_MAP[typeNum] || typeNum,
      grade: gradeToDisplay(gradeNum),
      country: getText(node, 'strCountry') || '',
    });
  });

  // === 教室パース ===
  const classrooms: Classroom[] = [];
  const clsNodes = doc.querySelectorAll('Classes > Cls');

  clsNodes.forEach(node => {
    const id = getText(node, 'strID');
    const name = getText(node, 'strName');
    if (!id || !name) {
      errors.push(`教室データが不完全です: ID=${id}`);
      return;
    }

    const capacity = parseInt(getText(node, 'strRoomCapacity') || '10');
    const stuIds: string[] = [];
    node.querySelectorAll('StuIDs > string').forEach(s => {
      const sid = s.textContent?.trim();
      if (sid) stuIds.push(sid);
    });

    classrooms.push({
      id,
      name,
      maxCapacity: capacity,
      studentIds: stuIds,
    });
  });

  return { students, classrooms, errors };
}

function getText(parent: Element, tagName: string): string {
  return parent.querySelector(tagName)?.textContent?.trim() || '';
}

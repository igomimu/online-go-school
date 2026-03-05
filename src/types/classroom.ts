// === 生徒 ===
export interface Student {
  id: string;
  name: string;
  rank: string;           // "1D", "3K" 等（一般段級位）
  internalRating: string; // "R3" 等（内部レーティング）
  type: string;           // "ネット生", "教室生", "大人会員" 等
  grade: string;          // "小4", "中2", "大人" 等
  country: string;        // 所在地
}

// === 教室 ===
export interface Classroom {
  id: string;
  name: string;           // "ネット市川道場 土曜クラス"
  maxCapacity: number;    // 10
  studentIds: string[];
}

// === igocampus strType → 表示名 ===
export const STUDENT_TYPE_MAP: Record<string, string> = {
  '0': '',
  '1': '家族',
  '2': '教室生',
  '3': 'ネット生',
  '4': '元生徒',
  '5': '体験',
  '6': 'ネット教室生',
  '7': '大人会員',
  '8': 'プロ志望',
};

// === igocampus strGrade(数値) → 学年表示 ===
export function gradeToDisplay(gradeNum: number): string {
  if (gradeNum <= 0) return '';
  if (gradeNum >= 1 && gradeNum <= 6) return `小${gradeNum}`;
  if (gradeNum >= 7 && gradeNum <= 9) return `中${gradeNum - 6}`;
  if (gradeNum >= 10 && gradeNum <= 12) return `高${gradeNum - 9}`;
  if (gradeNum >= 13 && gradeNum <= 15) return '大学';
  if (gradeNum >= 16) return '大人';
  return '';
}

// === 棋力を数値に変換（ペアリング用） ===
// 高いほど強い: 9D=9, 1D=1, 1K=0, 2K=-1, ..., 30K=-29
export function rankToNumber(rank: string): number {
  if (!rank) return -99;
  const m = rank.match(/^(\d+)(D|K|P)$/i);
  if (!m) return -99;
  const num = parseInt(m[1]);
  const type = m[2].toUpperCase();
  if (type === 'D' || type === 'P') return num;
  return 1 - num; // 1K=0, 2K=-1, ...
}

// === 棋力差から置き石を提案 ===
export function suggestHandicap(blackRank: string, whiteRank: string): { handicap: number; komi: number } {
  const bNum = rankToNumber(blackRank);
  const wNum = rankToNumber(whiteRank);
  if (bNum === -99 || wNum === -99) return { handicap: 0, komi: 6.5 };

  // 黒が弱い側（黒にハンデを与える）
  const diff = wNum - bNum;
  if (diff <= 0) return { handicap: 0, komi: 6.5 };
  if (diff === 1) return { handicap: 0, komi: 0.5 }; // 1目差: コミなし
  const h = Math.min(diff, 9);
  return { handicap: h, komi: 0.5 };
}

// === 生徒 ===
export interface Student {
  id: string;
  name: string;
  rank: string;           // 「初段」「3級」等（一般段級位。旧データは "1D" "3K"）
  internalRating: string; // "R3" 等（内部レーティング。0が最強）
  type: string;           // "ネット生", "教室生", "大人会員" 等
  grade: string;          // "小4", "中2", "大人" 等（手入力・fallback）
  country: string;        // 所在地
  birthdate?: string;     // 'YYYY-MM-DD'。登録されていれば学年は自動計算される
  studentCode?: string;   // 4桁ログインコード（表示用）
}

// === 教室 ===
export interface Classroom {
  id: string;
  name: string;           // "ネット市川道場 土曜クラス"
  maxCapacity: number;    // 10
  studentIds: string[];
  /** 棋力の見せ方。一般の大人の教室は段級、道場のクラスはランク */
  rankDisplay?: RankDisplay;
  /**
   * 道場の共有PCに置くリンクの鍵。これを持つ端末だけが名簿（氏名と4桁コード）を
   * 取得でき、名前を押すだけで入室できる。教室IDとは別物にしてある。
   */
  rosterToken?: string;
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

// === 棋力の表し方 ===
// 教室ごとにどちらで見せるかを選ぶ（2026-08-13 三村さん）。
//  dan_kyu … 一般の大人向け。「初段」「3級」の日本語表記
//  rating  … 道場の生徒向け。「R12」の内部レーティング（0が最強、60が入門）
export type RankDisplay = 'dan_kyu' | 'rating';
export const DEFAULT_RANK_DISPLAY: RankDisplay = 'dan_kyu';

const DAN_KANJI = ['初', '二', '三', '四', '五', '六', '七', '八'];

// === 段級位の選択肢（強い順）。八段〜初段、1級〜30級 ===
export const RANK_OPTIONS = [
  ...DAN_KANJI.map(k => `${k}段`).reverse(),
  ...Array.from({ length: 30 }, (_, i) => `${i + 1}級`),
] as const;

// === レーティングの選択肢（強い順）。R0 が最も強い ===
export const RATING_OPTIONS = Array.from({ length: 61 }, (_, i) => `R${i}`);

// 旧データの英字表記（"1D" "3K"）を日本語に読み替える。
// 保存済みの31件はこの関数を通して表示・変換する。
export function normalizeRank(rank: string): string {
  if (!rank) return '';
  const m = rank.match(/^(\d+)(D|K|P)$/i);
  if (!m) return rank; // すでに「初段」「3級」ならそのまま
  const num = parseInt(m[1]);
  const kind = m[2].toUpperCase();
  if (kind === 'D' || kind === 'P') {
    return num >= 1 && num <= DAN_KANJI.length ? `${DAN_KANJI[num - 1]}段` : `${num}段`;
  }
  return `${num}級`;
}

// === 棋力を数値に変換（ペアリング用） ===
// 高いほど強い: 八段=8, 初段=1, 1級=0, 2級=-1, ..., 30級=-29
// 英字の旧表記（1D / 3K）も受け付ける。
export function rankToNumber(rank: string): number {
  if (!rank) return -99;
  const jp = normalizeRank(rank);
  const dan = jp.match(/^(.+)段$/);
  if (dan) {
    const idx = DAN_KANJI.indexOf(dan[1]);
    if (idx >= 0) return idx + 1;
    const n = parseInt(dan[1]);
    return Number.isNaN(n) ? -99 : n;
  }
  const kyu = jp.match(/^(\d+)級$/);
  if (kyu) return 1 - parseInt(kyu[1]);
  return -99;
}

// === レーティングを数値に変換（0が最強なので符号を反転して強さの順に揃える） ===
export function ratingToNumber(rating: string): number {
  if (!rating) return -99;
  const m = rating.match(/^R?(\d+)$/i);
  if (!m) return -99;
  return -parseInt(m[1]);
}

// === 教室の表示方法に合わせて棋力を1つ選ぶ ===
export function displayRank(
  student: { rank?: string; internalRating?: string },
  display: RankDisplay = DEFAULT_RANK_DISPLAY,
): string {
  if (display === 'rating') return student.internalRating || normalizeRank(student.rank || '');
  return normalizeRank(student.rank || '') || student.internalRating || '';
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

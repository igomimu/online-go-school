// 日本の学年計算
//
// 4/1 を学年度の切り替え基準とし、4/1 以前生まれ（4/1 生まれを含む）は
// 同じ誕生年のうち「早生まれ」として同学年に組み込む（学校教育法準拠）。
//
// 例:
//   2019-04-02 生まれ（遅生まれ） → 2026年度 小1
//   2020-04-01 生まれ（早生まれ） → 2026年度 小1
//   2020-04-02 生まれ（遅生まれ） → 2026年度 年長（未就学）

/** 今日の日付に対応する学年度の西暦年（4/1 切り替え）。例: 2026-03-31 → 2025、2026-04-01 → 2026 */
export function currentSchoolYear(today: Date = new Date()): number {
  // getMonth() は 0 始まり、April = 3
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

/**
 * birthdate（'YYYY-MM-DD' 形式）から学年表示を返す。
 *
 * @param birthdate ISO 形式の生年月日
 * @param today 計算基準日（デフォルト: 現在）
 * @returns '小1' / '中2' / '高3' / '大学' / '大人' / '' （未就学児）
 */
export function calcGrade(birthdate: string, today: Date = new Date()): string {
  if (!birthdate) return '';
  const m = birthdate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, yStr, mStr, dStr] = m;
  const birthYear = Number(yStr);
  const birthMonth = Number(mStr);
  const birthDay = Number(dStr);
  if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) return '';

  const schoolYear = currentSchoolYear(today);
  // 早生まれ: 1/1 〜 4/1 生まれは学年度の前の暦年に「繰り上がる」扱い
  const isEarlyBorn = birthMonth < 4 || (birthMonth === 4 && birthDay === 1);
  const ageAtApril1 = isEarlyBorn ? (schoolYear - birthYear) : (schoolYear - birthYear - 1);

  // ageAtApril1 = 6 なら小1、7 なら小2、...
  const grade = ageAtApril1 - 5;
  if (grade < 1) return ''; // 未就学
  if (grade <= 6) return `小${grade}`;
  if (grade <= 9) return `中${grade - 6}`;
  if (grade <= 12) return `高${grade - 9}`;
  if (grade <= 15) return '大学';
  return '大人';
}

/**
 * 生年月日と手入力 grade から表示用学年を決める。
 * birthdate が有効なら自動計算を優先、なければ手入力 grade を使う。
 */
export function resolveGrade(birthdate: string | undefined, manualGrade: string, today: Date = new Date()): string {
  const auto = birthdate ? calcGrade(birthdate, today) : '';
  return auto || manualGrade || '';
}

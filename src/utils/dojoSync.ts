import type { Student } from '../types/classroom';

const DOJO_URL = import.meta.env.VITE_DOJO_SUPABASE_URL;
const DOJO_KEY = import.meta.env.VITE_DOJO_SUPABASE_KEY;

// dojo-appのrank(数値) → 棋力表示
function dojoRankToDisplay(rank: string | null): string {
  if (!rank) return '';
  const n = parseInt(rank);
  if (isNaN(n) || n <= 0) return '';
  if (n === 1) return '1D';
  return `${n}K`;
}

// dojo-appのkakuzuke → 内部レーティング表記
function kakuzukeToRating(kakuzuke: string | null): string {
  switch (kakuzuke) {
    case 'tatsujin': return '達人';
    case 'shikkarisan': return 'しっかり';
    case 'minarai': return '見習い';
    default: return '';
  }
}

interface DojoStudent {
  id: string;
  name: string;
  rank: string | null;
  student_type: string;
  grade: string | null;
  address: string | null;
  kakuzuke: string | null;
}

export async function fetchDojoNetStudents(): Promise<{ students: Student[]; error?: string }> {
  if (!DOJO_URL || !DOJO_KEY) {
    return { students: [], error: '道場アプリの接続情報が設定されていません (.env)' };
  }

  try {
    const url = `${DOJO_URL}/rest/v1/students?student_type=eq.net&status=eq.active&select=id,name,rank,student_type,grade,address,kakuzuke&order=name`;
    const res = await fetch(url, {
      headers: {
        'apikey': DOJO_KEY,
        'Authorization': `Bearer ${DOJO_KEY}`,
      },
    });

    if (!res.ok) {
      return { students: [], error: `道場API エラー: ${res.status} ${res.statusText}` };
    }

    const data: DojoStudent[] = await res.json();

    const students: Student[] = data.map(d => ({
      id: d.id,
      name: d.name,
      rank: dojoRankToDisplay(d.rank),
      internalRating: kakuzukeToRating(d.kakuzuke),
      type: 'ネット生',
      grade: d.grade || '',
      country: d.address || '',
    }));

    return { students };
  } catch (err) {
    return { students: [], error: `接続エラー: ${err instanceof Error ? err.message : String(err)}` };
  }
}

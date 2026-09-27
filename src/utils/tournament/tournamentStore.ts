import type { Tournament } from '../../types/tournament';
import { getSupabase } from '../liveGameApi';

// 大会の正本は Supabase（go_school_tournaments、講師だけが読み書き）。
// 🔴 以前は講師のブラウザの localStorage だけに置いていて、別のPCでは大会が見えなかった（2026-09-27）。
// localStorage は開いた直後の表示用キャッシュと、以前の版で作った大会の移行元として残す。

const TOURNAMENTS_STORAGE_KEY = 'go-school-tournaments';
const TABLE = 'go_school_tournaments';

function readTournaments(): Tournament[] {
  try {
    const raw = localStorage.getItem(TOURNAMENTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Tournament[];
  } catch {
    return [];
  }
}

function writeTournaments(tournaments: Tournament[]): void {
  try {
    localStorage.setItem(TOURNAMENTS_STORAGE_KEY, JSON.stringify(tournaments));
  } catch (err) {
    console.error('Failed to save tournaments to localStorage', err);
  }
}

function newestFirst(a: Tournament, b: Tournament): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** 端末キャッシュの大会（開いた直後の表示用） */
export function getTournaments(classroomId?: string | null): Tournament[] {
  const all = readTournaments();
  if (!classroomId) return all;
  return all.filter(t => t.classroomId === classroomId);
}

export function getTournament(id: string): Tournament | null {
  const all = readTournaments();
  return all.find(t => t.id === id) || null;
}

function cacheTournament(tournament: Tournament): void {
  const all = readTournaments();
  const idx = all.findIndex(t => t.id === tournament.id);
  if (idx >= 0) {
    all[idx] = tournament;
  } else {
    all.unshift(tournament);
  }
  writeTournaments(all);
}

function uncacheTournament(id: string): void {
  writeTournaments(readTournaments().filter(t => t.id !== id));
}

async function upsertRemote(tournaments: Tournament[]): Promise<void> {
  if (tournaments.length === 0) return;
  const { error } = await getSupabase()
    .from(TABLE)
    .upsert(tournaments.map(t => ({
      id: t.id,
      classroom_id: t.classroomId,
      data: t,
      updated_at: t.updatedAt,
    })), { onConflict: 'id' });
  if (error) throw error;
}

/** 同じ大会なら、更新時刻の新しい方を採る */
export function newerTournament(a: Tournament, b: Tournament): Tournament {
  return (a.updatedAt || '') >= (b.updatedAt || '') ? a : b;
}

/**
 * 教室の大会をアカウントから読む。端末にしか無い大会（以前の版で作ったもの）と、
 * 端末の方が新しい大会（保存に失敗したもの）はここでアカウントへ送る。
 * 読んでいる間に画面で保存した分を消さないよう、キャッシュへは書く直前の中身と比べて新しい方を残す。
 */
export async function loadTournaments(classroomId: string): Promise<Tournament[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, data')
    .eq('classroom_id', classroomId);
  if (error) throw error;

  const remote = new Map(
    (data ?? [])
      .map(row => (row as { data: Tournament }).data)
      .filter((t): t is Tournament => !!t && typeof t.id === 'string')
      .map(t => [t.id, t]),
  );
  const toUpload = getTournaments(classroomId).filter(t => {
    const r = remote.get(t.id);
    return !r || newerTournament(t, r) === t && t.updatedAt !== r.updatedAt;
  });
  await upsertRemote(toUpload);

  const merged = new Map(remote);
  for (const t of getTournaments(classroomId)) {
    const r = merged.get(t.id);
    merged.set(t.id, r ? newerTournament(t, r) : t);
  }
  const list = [...merged.values()].sort(newestFirst);
  const others = readTournaments().filter(t => t.classroomId !== classroomId);
  writeTournaments([...list, ...others]);
  return list;
}

/** 大会を保存する（端末キャッシュへはすぐ、アカウントへは送り終わるまで待つ） */
export async function saveTournament(tournament: Tournament): Promise<void> {
  cacheTournament(tournament);
  await upsertRemote([tournament]);
}

export async function deleteTournament(id: string): Promise<void> {
  uncacheTournament(id);
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

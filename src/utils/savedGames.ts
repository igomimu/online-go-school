import type { SavedGame } from '../types/game';
import { getSupabase } from './liveGameApi';
import { makeStudentIdentity } from './identityUtils';

const STORAGE_KEY = 'go-school-saved-games';

// --- localStorage (キャッシュ兼フォールバック) ---

export function loadSavedGames(): SavedGame[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as SavedGame[];
  } catch {
    return [];
  }
}

function saveToLocalStorage(games: SavedGame[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    // localStorage full — ignore
  }
}

// --- 保存（localStorage + Supabase） ---

export function saveGame(game: SavedGame): void {
  // localStorage に即座に保存
  const games = loadSavedGames().filter(g => g.id !== game.id);
  games.unshift(game);
  saveToLocalStorage(games);

  // Supabase に非同期で保存
  const sb = getSupabase();
  if (sb) {
    sb.from('go_school_games').upsert({
      id: game.id,
      date: game.date,
      black_player: game.blackPlayer,
      white_player: game.whitePlayer,
      board_size: game.boardSize,
      handicap: game.handicap,
      komi: game.komi,
      result: game.result,
      sgf: game.sgf,
    }).then(({ error }) => {
      if (error) console.error('Supabase save error:', error.message);
    });
  }
}

export function deleteGame(id: string): void {
  const games = loadSavedGames().filter(g => g.id !== id);
  saveToLocalStorage(games);

  const sb = getSupabase();
  if (sb) {
    sb.from('go_school_games').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('Supabase delete error:', error.message);
    });
  }
}

export function getGame(id: string): SavedGame | undefined {
  return loadSavedGames().find(g => g.id === id);
}

// --- Supabaseから全棋譜を取得してlocalStorageと同期 ---

export async function syncFromSupabase(): Promise<SavedGame[]> {
  const sb = getSupabase();
  if (!sb) return loadSavedGames();

  const { data, error } = await sb
    .from('go_school_games')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Supabase sync error:', error?.message);
    return loadSavedGames();
  }

  const games: SavedGame[] = data.map(row => ({
    id: row.id,
    date: row.date,
    blackPlayer: row.black_player,
    whitePlayer: row.white_player,
    boardSize: row.board_size,
    handicap: row.handicap,
    komi: row.komi,
    result: row.result,
    sgf: row.sgf,
  }));

  // localStorageも更新
  saveToLocalStorage(games);

  return games;
}

export async function loadSavedGamesForStudent(studentName: string, studentIdentity?: string): Promise<SavedGame[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb.from('go_school_games').select('*');

  const orConditions = [
    `black_player.eq."${studentName}"`,
    `white_player.eq."${studentName}"`
  ];
  if (studentIdentity) {
    orConditions.push(`black_player.eq."${studentIdentity}"`);
    orConditions.push(`white_player.eq."${studentIdentity}"`);
    const sid = makeStudentIdentity(studentIdentity);
    orConditions.push(`black_player.eq."${sid}"`);
    orConditions.push(`white_player.eq."${sid}"`);
  }

  const { data, error } = await query
    .or(orConditions.join(','))
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Supabase load history error:', error?.message);
    return [];
  }

  return data.map(row => ({
    id: row.id,
    date: row.date,
    blackPlayer: row.black_player,
    whitePlayer: row.white_player,
    boardSize: row.board_size,
    handicap: row.handicap,
    komi: row.komi,
    result: row.result,
    sgf: row.sgf,
  }));
}

import type { SavedGame } from '../types/game';

const STORAGE_KEY = 'go-school-saved-games';

export function loadSavedGames(): SavedGame[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as SavedGame[];
  } catch {
    return [];
  }
}

export function saveGame(game: SavedGame): void {
  const games = loadSavedGames();
  games.unshift(game); // 最新を先頭に
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export function deleteGame(id: string): void {
  const games = loadSavedGames().filter(g => g.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export function getGame(id: string): SavedGame | undefined {
  return loadSavedGames().find(g => g.id === id);
}

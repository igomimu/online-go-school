import type { Tournament } from '../../types/tournament';

const TOURNAMENTS_STORAGE_KEY = 'go-school-tournaments';

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

export function getTournaments(classroomId?: string | null): Tournament[] {
  const all = readTournaments();
  if (!classroomId) return all;
  return all.filter(t => t.classroomId === classroomId);
}

export function getTournament(id: string): Tournament | null {
  const all = readTournaments();
  return all.find(t => t.id === id) || null;
}

export function saveTournament(tournament: Tournament): void {
  const all = readTournaments();
  const idx = all.findIndex(t => t.id === tournament.id);
  if (idx >= 0) {
    all[idx] = tournament;
  } else {
    all.unshift(tournament);
  }
  writeTournaments(all);
}

export function deleteTournament(id: string): void {
  const all = readTournaments();
  const filtered = all.filter(t => t.id !== id);
  writeTournaments(filtered);
}

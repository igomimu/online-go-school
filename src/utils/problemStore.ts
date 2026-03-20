import type { Problem } from '../types/problem';

const STORAGE_KEY = 'go-school-problems';

export function loadProblems(): Problem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveProblems(problems: Problem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(problems));
}

export function addProblem(problem: Problem): void {
  const problems = loadProblems();
  problems.push(problem);
  saveProblems(problems);
}

export function removeProblem(id: string): void {
  const problems = loadProblems().filter(p => p.id !== id);
  saveProblems(problems);
}

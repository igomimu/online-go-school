import { functionsBaseUrl, getSupabase } from './liveGameApi';

export const PENDING_RESUME_KEY = 'go-school-pending-resume';

let accessToken: string | null = null;
let initialized = false;

export function initUnloadInterruptAuthCache(): void {
  if (initialized) return;
  initialized = true;

  let supabase: ReturnType<typeof getSupabase>;
  try {
    supabase = getSupabase();
  } catch {
    return;
  }
  supabase.auth.getSession()
    .then(({ data }) => {
      accessToken = data.session?.access_token ?? null;
    })
    .catch(() => {
      accessToken = null;
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
  });
}

export function getPendingResumeGameId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_RESUME_KEY);
  } catch {
    return null;
  }
}

export function clearPendingResumeGameId(): void {
  try {
    sessionStorage.removeItem(PENDING_RESUME_KEY);
  } catch {
    // ignore
  }
}

export function interruptGameOnUnload(gameId: string): void {
  try {
    sessionStorage.setItem(PENDING_RESUME_KEY, gameId);
  } catch {
    // ignore
  }

  if (!accessToken) return;

  fetch(`${functionsBaseUrl()}/manage_game_action`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'interrupt', game_id: gameId }),
  }).catch(() => {
    // pagehide transport is best-effort
  });
}

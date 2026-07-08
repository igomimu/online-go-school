import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallSnapshot {
  canInstall: boolean;
  isStandalone: boolean;
  isIos: boolean;
}

const listeners = new Set<() => void>();
let promptEvent: BeforeInstallPromptEvent | null = null;
let initialized = false;
let snapshot: PwaInstallSnapshot = computeSnapshot();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function computeSnapshot(): PwaInstallSnapshot {
  if (!isBrowser()) {
    return { canInstall: false, isStandalone: false, isIos: false };
  }

  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isiOSDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return {
    canInstall: promptEvent !== null,
    isStandalone: standaloneMedia || navigatorStandalone,
    isIos: isiOSDevice,
  };
}

function emit(): void {
  snapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

function init(): void {
  if (initialized || !isBrowser()) return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptEvent = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    emit();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
  emit();
}

function subscribe(listener: () => void): () => void {
  init();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PwaInstallSnapshot {
  init();
  return snapshot;
}

function getServerSnapshot(): PwaInstallSnapshot {
  return { canInstall: false, isStandalone: false, isIos: false };
}

export function usePwaInstall() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const install = async (): Promise<boolean> => {
    if (!promptEvent) return false;

    const event = promptEvent;
    promptEvent = null;
    emit();

    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === 'accepted';
  };

  return {
    ...state,
    install,
    shouldShowInstall: !state.isStandalone && (state.canInstall || state.isIos),
  };
}

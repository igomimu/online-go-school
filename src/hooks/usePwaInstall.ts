import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallSnapshot {
  canInstall: boolean;
  isStandalone: boolean;
  isIos: boolean;
  appInstalled: boolean;
}

const listeners = new Set<() => void>();
let promptEvent: BeforeInstallPromptEvent | null = null;
let appInstalled = false;
let initialized = false;
let snapshot: PwaInstallSnapshot = computeSnapshot();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function computeSnapshot(): PwaInstallSnapshot {
  if (!isBrowser()) {
    return { canInstall: false, isStandalone: false, isIos: false, appInstalled: false };
  }

  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isiOSDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return {
    canInstall: promptEvent !== null,
    isStandalone: standaloneMedia || navigatorStandalone,
    isIos: isiOSDevice,
    appInstalled,
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
    appInstalled = true;
    emit();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
  emit();
}

// beforeinstallprompt はReactマウント前に発火し得るため、モジュール読み込み時に即登録する
if (isBrowser()) init();

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
  return { canInstall: false, isStandalone: false, isIos: false, appInstalled: false };
}

/**
 * インストールを実行する。beforeinstallprompt が使えればネイティブプロンプト、
 * 使えなければブラウザ別の手動手順を案内する（ボタンは常時表示の方針）。
 */
export async function promptOrExplainInstall(): Promise<boolean> {
  if (promptEvent) {
    const event = promptEvent;
    promptEvent = null;
    emit();
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === 'accepted';
  }

  if (snapshot.isIos) {
    alert('Safari の共有ボタン（□↑）から「ホーム画面に追加」を選んでください。');
  } else {
    alert(
      'ブラウザのメニューからインストールできます。\n\n' +
      'Chrome: 右上メニュー（︙）→「保存と共有」→「ページをアプリとしてインストール」\n' +
      'Edge: 右上メニュー（…）→「アプリ」→「このサイトをアプリとしてインストール」\n\n' +
      '※メニューに項目が無い場合は、ページを一度再読み込みしてからお試しください。',
    );
  }
  return false;
}

export function usePwaInstall() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    ...state,
    install: promptOrExplainInstall,
    // アプリ内(standalone)起動時とインストール直後以外は常に表示する
    shouldShowInstall: !state.isStandalone && !state.appInstalled,
  };
}

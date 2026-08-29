/**
 * 「次回すぐ開けるようにする」導線の文言。
 *
 * 🔴 大人の生徒には「PWA」も「アプリをインストール」も通じない。
 * パソコンで「アプリ」と言うと「パソコンなのにアプリ？」になる（2026-08-30 三村さん）。
 * そこで、技術の名前ではなく **結果だけ** を書く:
 *   パソコン → デスクトップにアイコンを作る
 *   スマホ・タブレット → ホーム画面にアイコンを追加
 */
export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallCopy {
  /** 主ボタン。何が起きるかをそのまま書く */
  action: string;
  /** 狭い場所（ヘッダー）用の短い形 */
  short: string;
  /** なぜやるのか */
  benefit: string;
  /**
   * ブラウザ側の画面には必ず「インストール」と出る（Chrome「ページをアプリとして
   * インストール」／Edge「このサイトをアプリとしてインストール」）。こちらが言葉を
   * 避けても押した先で遭遇するので、先に橋渡ししておく。
   */
  note?: string;
  /** ブラウザ純正の案内が出せないときの手順 */
  steps: string;
}

export function detectInstallPlatform(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): InstallPlatform {
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  return 'desktop';
}

const DESKTOP_STEPS = [
  'ブラウザの右上のメニューから追加できます。',
  '',
  'Chrome: ︙ →「保存と共有」→「ページをアプリとしてインストール」',
  'Edge: … →「アプリ」→「このサイトをアプリとしてインストール」',
  '',
  '※メニューには「アプリ」と書かれていますが、デスクトップにアイコンができるだけです。',
  '※Edge は最後に「デスクトップにショートカットを作成」にチェックを入れてください。',
].join('\n');

export function installCopy(platform: InstallPlatform = detectInstallPlatform()): InstallCopy {
  if (platform === 'ios') {
    return {
      action: 'ホーム画面に追加',
      short: 'ホーム画面へ',
      benefit: '次回からは、ホーム画面のアイコンを押すだけで開けます。',
      steps: '画面の下にある共有ボタン（□に↑）を押して、「ホーム画面に追加」を選んでください。',
    };
  }
  if (platform === 'android') {
    return {
      action: 'ホーム画面に追加',
      short: 'ホーム画面へ',
      benefit: '次回からは、ホーム画面のアイコンを押すだけで開けます。',
      note: '「インストール」と出ることがありますが、ホーム画面にアイコンを作るという意味です。',
      steps: 'ブラウザのメニュー（︙）を開いて、「ホーム画面に追加」を選んでください。',
    };
  }
  return {
    action: 'デスクトップにアイコンを作る',
    short: 'アイコンを作る',
    benefit: '次回からは、デスクトップのアイコンを押すだけで開けます。',
    note: '途中で「アプリとしてインストール」と出ますが、アイコンを作るという意味です。',
    steps: DESKTOP_STEPS,
  };
}

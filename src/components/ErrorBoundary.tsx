import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 実行時エラーで画面が真っ白になるのを防ぐ受け皿。
 *
 * 授業中・対局中に白画面になると、生徒は何が起きたか分からず、こちらも
 * 状況を聞き出せない。React は握られなかったエラーでツリー全体を捨てるので、
 * 受け皿が無いと body が空になる。
 *
 * 対局の状態はサーバー側が正本なので、読み込み直せば局面は元に戻る。
 * だから復帰手段は「開き直す」で足りる。エラー文言も出しておく
 * （生徒が読み上げれば、こちらで原因を追える）。
 */
interface Props {
  children: ReactNode;
  /** どこで起きたか分かるように付ける（「対局画面」など） */
  label?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 画面に出す文言は短くするので、詳細はコンソールに残す
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
        <div className="glass-panel w-full max-w-md p-6 space-y-4">
          <h2 className="text-lg font-bold">
            {this.props.label ? `${this.props.label}の表示が止まりました` : '表示が止まりました'}
          </h2>
          <p className="text-sm text-muted">
            打った手や対局の記録は残っています。開き直すと続きから表示されます。
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={this.handleReload} className="premium-button text-sm">
              開き直す
            </button>
            <button onClick={this.handleRetry} className="secondary-button text-sm">
              このまま再表示
            </button>
          </div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">エラーの内容</summary>
            <p className="mt-2 break-all font-mono">{error.message || String(error)}</p>
          </details>
        </div>
      </div>
    );
  }
}

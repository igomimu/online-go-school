import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error('盤の描画に失敗しました');
  return <div>対局画面</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React はエラー時にコンソールへ大量に出すので、テスト出力を汚さないよう黙らせる
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('中身が無事なときはそのまま描く', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('対局画面')).toBeInTheDocument();
  });

  it('中身が落ちても白画面にせず、復帰の手立てを出す', () => {
    render(
      <ErrorBoundary label="対局盤">
        <Boom explode />
      </ErrorBoundary>
    );
    expect(screen.getByText('対局盤の表示が止まりました')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開き直す' })).toBeInTheDocument();
    // 何が起きたか読み上げてもらえるよう、エラー文言も出す
    expect(screen.getByText('盤の描画に失敗しました')).toBeInTheDocument();
  });

  it('打った手は残っていることを伝える', () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>
    );
    expect(screen.getByText(/打った手や対局の記録は残っています/)).toBeInTheDocument();
  });
});

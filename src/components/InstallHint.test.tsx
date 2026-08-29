import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstallHint from './InstallHint';
import { usePwaInstall } from '../hooks/usePwaInstall';

vi.mock('../hooks/usePwaInstall', () => ({
  usePwaInstall: vi.fn(),
}));

const install = vi.fn();

function mockPwa(shouldShowInstall: boolean) {
  vi.mocked(usePwaInstall).mockReturnValue({
    canInstall: shouldShowInstall,
    isStandalone: false,
    isIos: false,
    appInstalled: false,
    install,
    shouldShowInstall,
  } as unknown as ReturnType<typeof usePwaInstall>);
}

describe('次回の入り口の案内', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('パソコンでは「アプリ」とも「インストール」とも言わずに誘う', () => {
    mockPwa(true);
    render(<InstallHint />);

    expect(screen.getByTestId('install-hint-accept')).toHaveTextContent('デスクトップにアイコンを作る');
    // ブラウザ側で出る語だけは、先に断っておく
    expect(screen.getByTestId('install-hint')).toHaveTextContent('「アプリとしてインストール」と出ますが');
  });

  it('「あとで」を押したら二度と出ない', () => {
    mockPwa(true);
    const first = render(<InstallHint />);
    fireEvent.click(screen.getByTestId('install-hint-dismiss'));
    expect(screen.queryByTestId('install-hint')).toBeNull();

    first.unmount();
    render(<InstallHint />);
    expect(screen.queryByTestId('install-hint')).toBeNull();
  });

  it('追加できない端末（ホーム画面に入れる手段が無い等）では出さない', () => {
    mockPwa(false);
    render(<InstallHint />);
    expect(screen.queryByTestId('install-hint')).toBeNull();
  });

  it('ブラウザの画面で断られたら、案内は残す', async () => {
    mockPwa(true);
    install.mockResolvedValue(false);
    render(<InstallHint />);

    fireEvent.click(screen.getByTestId('install-hint-accept'));
    await vi.waitFor(() => expect(install).toHaveBeenCalled());
    expect(screen.getByTestId('install-hint')).toBeVisible();
  });
});

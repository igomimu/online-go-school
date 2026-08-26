import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GameCreationDialog from './GameCreationDialog';

describe('GameCreationDialog', () => {
  const defaultProps = {
    students: ['たろう', 'はなこ', 'じろう'],
    teacherName: '三村智保',
    onClose: vi.fn(),
    onCreate: vi.fn(),
  };

  it('碁盤サイズを最上部のドロップダウンから7種類選べる', () => {
    render(<GameCreationDialog {...defaultProps} />);
    const boardSelect = screen.getByTestId('board-size-select');
    expect(within(boardSelect).getAllByRole('option').map(option => option.textContent)).toEqual([
      '19x19', '17x17', '15x15', '13x13', '11x11', '9x9', '7x7',
    ]);
    fireEvent.change(boardSelect, { target: { value: '7' } });
    expect((boardSelect as HTMLSelectElement).value).toBe('7');
  });

  it('初期状態は講師が白、最初の生徒が黒で30分の時間制限になる', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);

    expect(screen.getByTestId('self-player-name')).toHaveTextContent('三村智保');
    expect(screen.getByRole('radio', { name: '白' })).toBeChecked();
    expect(screen.getByTestId('opponent-player-select')).toHaveValue('たろう');
    expect(screen.getByTestId('time-limit-checkbox')).toBeChecked();
    expect(screen.getByTestId('nhk-style-checkbox')).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: '持ち時間（分）' })).toHaveValue('30');
    expect(screen.getByRole('combobox', { name: '秒読み回数' })).toHaveValue('0');
    expect(screen.getByRole('combobox', { name: '秒読み（秒/手）' })).toHaveValue('30');

    fireEvent.click(screen.getByTestId('create-game-button'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      blackPlayer: 'たろう',
      whitePlayer: '三村智保',
      boardSize: 19,
      handicap: 0,
      komi: 6.5,
      clock: expect.objectContaining({
        timeSystem: 'STANDARD',
        mainTimeSeconds: 1800,
        byoyomiPeriods: 0,
      }),
    })));
  });

  it('生徒行から渡された生徒を相手の初期値として更新する', () => {
    const { rerender } = render(
      <GameCreationDialog {...defaultProps} students={['sid:1001', 'sid:1002']} teacherName="teacher" initialBlackPlayer="sid:1001" />,
    );
    expect(screen.getByTestId('opponent-player-select')).toHaveValue('sid:1001');

    rerender(
      <GameCreationDialog {...defaultProps} students={['sid:1001', 'sid:1002']} teacherName="teacher" initialBlackPlayer="sid:1002" />,
    );
    expect(screen.getByTestId('opponent-player-select')).toHaveValue('sid:1002');
  });

  it('黒白入替ボタンは表示せず、自分の黒白ラジオで対局者を入れ替える', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    expect(screen.queryByText('黒白を入れ替える')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '黒' }));
    fireEvent.click(screen.getByTestId('create-game-button'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      blackPlayer: '三村智保',
      whitePlayer: 'たろう',
    })));
  });

  it('生徒同士対局では最初に選んだ生徒を自分側へ移し、別の生徒を相手にする', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} initialBlackPlayer="はなこ" onCreate={onCreate} />);

    fireEvent.click(screen.getByTestId('student-vs-student-checkbox'));
    expect(screen.getByTestId('self-player-name')).toHaveTextContent('はなこ');
    expect(screen.getByTestId('opponent-player-select')).not.toHaveValue('はなこ');
    fireEvent.click(screen.getByTestId('create-game-button'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      blackPlayer: 'たろう',
      whitePlayer: 'はなこ',
    })));
  });

  it('置き石とコミの指定範囲をドロップダウンで選べる', () => {
    render(<GameCreationDialog {...defaultProps} />);
    const handicap = screen.getByTestId('handicap-select');
    expect(within(handicap).getAllByRole('option').map(option => option.textContent)).toEqual([
      '0', '2', '3', '4', '5', '6', '7', '8', '9',
    ]);
    const komi = screen.getByTestId('komi-select');
    expect((komi as HTMLSelectElement).value).toBe('6.5');
    expect(within(komi).getByRole('option', { name: '-7.5' })).toBeInTheDocument();
    expect(within(komi).getByRole('option', { name: 'その他' })).toBeInTheDocument();
  });

  it('コミの「その他」では自由入力した値を使う', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    fireEvent.change(screen.getByTestId('komi-select'), { target: { value: 'other' } });
    fireEvent.change(screen.getByTestId('custom-komi-input'), { target: { value: '-10.5' } });
    fireEvent.click(screen.getByTestId('create-game-button'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ komi: -10.5 })));
  });

  it('時間制限をオフにすると時間欄が無効になり、時計なしで作成する', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('time-limit-checkbox'));
    expect(screen.getByTestId('nhk-style-checkbox')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '持ち時間（分）' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('create-game-button'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ clock: undefined })));
  });

  it('NHK杯方式では通常時間欄を考慮時間1〜10分だけの選択へ切り替える', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('nhk-style-checkbox'));

    expect(screen.queryByRole('combobox', { name: '持ち時間（分）' })).not.toBeInTheDocument();
    const consideration = screen.getByTestId('nhk-consideration-select');
    expect(within(consideration).getAllByRole('option').map(option => option.textContent)).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    ]);
    fireEvent.change(consideration, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('create-game-button'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      clock: expect.objectContaining({
        timeSystem: 'NHK',
        byoyomiSeconds: 30,
        byoyomiPeriods: 4,
        considerationSeconds: 60,
        blackTimeLeft: 30,
      }),
    })));
  });

  it('ニギリの結果を自分の黒白ラジオへ反映する', async () => {
    vi.useFakeTimers();
    try {
      render(<GameCreationDialog {...defaultProps} students={['たろう']} />);
      fireEvent.click(screen.getByTestId('nigiri-button'));
      await act(async () => { vi.advanceTimersByTime(3000); });
      expect(screen.getByRole('radio', { name: '黒' }).getAttribute('checked') !== null
        || screen.getByRole('radio', { name: '白' }).getAttribute('checked') !== null).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('作成処理中は二重送信しない', async () => {
    let resolveCreate!: () => void;
    const onCreate = vi.fn(() => new Promise<void>(resolve => { resolveCreate = resolve; }));
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    const button = screen.getByTestId('create-game-button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onCreate).toHaveBeenCalledTimes(1);
    await act(async () => { resolveCreate(); });
  });

  /**
   * 2026-08-26 三村さんの要望: 置き石を選んだらコミは自動で 0.5 に。
   * 互先でなければコミ 6.5 のままでは成立しないので、毎回直す手間が要っていた。
   */
  describe('置き石とコミの連動', () => {
    it('置き石を選ぶと、コミが 0.5 になる', () => {
      render(<GameCreationDialog {...defaultProps} />);
      const komi = screen.getByTestId('komi-select') as HTMLSelectElement;
      expect(komi.value).toBe('6.5');

      fireEvent.change(screen.getByTestId('handicap-select'), { target: { value: '4' } });
      expect((screen.getByTestId('komi-select') as HTMLSelectElement).value).toBe('0.5');
    });

    it('互先に戻すと、コミが 6.5 に戻る', () => {
      render(<GameCreationDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId('handicap-select'), { target: { value: '3' } });
      expect((screen.getByTestId('komi-select') as HTMLSelectElement).value).toBe('0.5');

      fireEvent.change(screen.getByTestId('handicap-select'), { target: { value: '0' } });
      expect((screen.getByTestId('komi-select') as HTMLSelectElement).value).toBe('6.5');
    });

    it('コミを自由入力にしているときは、置き石を変えても触らない', () => {
      render(<GameCreationDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId('komi-select'), { target: { value: 'other' } });
      const input = screen.getByTestId('custom-komi-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2.5' } });

      fireEvent.change(screen.getByTestId('handicap-select'), { target: { value: '5' } });
      expect((screen.getByTestId('custom-komi-input') as HTMLInputElement).value).toBe('2.5');
    });
  });
});

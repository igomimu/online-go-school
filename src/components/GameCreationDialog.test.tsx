import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GameCreationDialog from './GameCreationDialog';

describe('GameCreationDialog', () => {
  const defaultProps = {
    students: ['たろう', 'はなこ', 'じろう'],
    teacherName: '三村先生',
    onClose: vi.fn(),
    onCreate: vi.fn(),
  };

  it('ダイアログのタイトルを表示', () => {
    render(<GameCreationDialog {...defaultProps} />);
    expect(screen.getByText('対局作成')).toBeTruthy();
  });

  it('生徒と先生がプレイヤー候補に表示される', () => {
    render(<GameCreationDialog {...defaultProps} />);
    const options = screen.getAllByRole('option');
    const names = options.map(o => o.textContent);
    expect(names).toContain('三村先生（先生）');
    expect(names).toContain('たろう');
    expect(names).toContain('はなこ');
  });

  it('碁盤サイズ選択ボタン', () => {
    render(<GameCreationDialog {...defaultProps} />);
    expect(screen.getByText('19路')).toBeTruthy();
    expect(screen.getByText('13路')).toBeTruthy();
    expect(screen.getByText('9路')).toBeTruthy();
  });

  it('閉じるボタン', () => {
    const onClose = vi.fn();
    render(<GameCreationDialog {...defaultProps} onClose={onClose} />);
    // X ボタンをクリック（lucide-reactのXアイコンを含むbutton）
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find(b => b.querySelector('.lucide-x'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('対局開始ボタンでonCreateが呼ばれ、作成後に閉じる', async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} onClose={onClose} />);
    // デフォルト: black=たろう, white=はなこ（異なるので有効）
    fireEvent.click(screen.getByText('対局開始'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        blackPlayer: 'たろう',
        whitePlayer: 'はなこ',
        boardSize: 19,
        handicap: 0,
        komi: 6.5,
      })
    ));
    expect(onClose).toHaveBeenCalled();
  });

  it('initialBlackPlayerが変わったら選択中の生徒を更新する', () => {
    const { rerender } = render(
      <GameCreationDialog {...defaultProps} students={['sid:1001', 'sid:1002']} teacherName="teacher" initialBlackPlayer="sid:1001" />,
    );
    expect((screen.getByTestId('black-player-select') as HTMLSelectElement).value).toBe('sid:1001');

    rerender(
      <GameCreationDialog {...defaultProps} students={['sid:1001', 'sid:1002']} teacherName="teacher" initialBlackPlayer="sid:1002" />,
    );

    expect((screen.getByTestId('black-player-select') as HTMLSelectElement).value).toBe('sid:1002');
    expect((screen.getByTestId('white-player-select') as HTMLSelectElement).value).toBe('teacher');
  });

  it('同じプレイヤーを選ぶとエラーメッセージ', () => {
    render(<GameCreationDialog {...defaultProps} students={['たろう']} />);
    // students=[たろう]だけだと、black=たろう, white=三村先生（異なる）
    // 白をたろうに変更
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'たろう' } });
    expect(screen.getByText('黒と白に同じプレイヤーは選べません')).toBeTruthy();
  });

  it('同じプレイヤーだと対局開始ボタンが無効', () => {
    render(<GameCreationDialog {...defaultProps} students={['たろう']} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'たろう' } });
    const startBtn = screen.getByText('対局開始');
    expect((startBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('手合割は互先→定先→2子→…9子の順に並ぶ', () => {
    render(<GameCreationDialog {...defaultProps} />);
    const labels = ['互先', '定先', '2子', '3子', '9子'];
    labels.forEach(l => expect(screen.getByText(l)).toBeTruthy());
    // 1子は無い
    expect(screen.queryByText('1子')).toBeNull();
  });

  it('定先を選ぶとコミが0.5になる', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('handicap-sen'));
    fireEvent.click(screen.getByText('対局開始'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ handicap: 0, komi: 0.5 }),
    ));
  });

  it('互先はコミ6.5、置石は0のまま', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('handicap-sen'));
    fireEvent.click(screen.getByTestId('handicap-even'));
    fireEvent.click(screen.getByText('対局開始'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ handicap: 0, komi: 6.5 }),
    ));
  });

  it('置石を選ぶとコミは0.5', async () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('handicap-3'));
    fireEvent.click(screen.getByText('対局開始'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ handicap: 3, komi: 0.5 }),
    ));
  });

  it('ニギリは互先のときだけ出る', () => {
    render(<GameCreationDialog {...defaultProps} />);
    expect(screen.getByTestId('nigiri-button')).toBeTruthy();
    fireEvent.click(screen.getByTestId('handicap-3'));
    expect(screen.queryByTestId('nigiri-button')).toBeNull();
  });

  it('ニギリを押すと黒番が決まり、片方は必ず黒になる', async () => {
    vi.useFakeTimers();
    try {
      render(<GameCreationDialog {...defaultProps} students={['たろう', 'はなこ']} />);
      const before = {
        black: (screen.getByTestId('black-player-select') as HTMLSelectElement).value,
        white: (screen.getByTestId('white-player-select') as HTMLSelectElement).value,
      };
      fireEvent.click(screen.getByTestId('nigiri-button'));
      await act(async () => { vi.advanceTimersByTime(3000); });

      const result = screen.getByTestId('nigiri-result').textContent ?? '';
      const black = (screen.getByTestId('black-player-select') as HTMLSelectElement).value;
      const white = (screen.getByTestId('white-player-select') as HTMLSelectElement).value;
      // 決まった側が黒番の選択に入り、二人の顔ぶれは変わらない
      expect(result).toContain('の黒番');
      expect([before.black, before.white]).toContain(black);
      expect([before.black, before.white]).toContain(white);
      expect(black).not.toBe(white);
    } finally {
      vi.useRealTimers();
    }
  });
});

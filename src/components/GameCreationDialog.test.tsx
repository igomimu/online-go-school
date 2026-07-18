import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});

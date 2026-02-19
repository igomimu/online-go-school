import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('対局作成')).toBeInTheDocument();
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
    expect(screen.getByText('19路')).toBeInTheDocument();
    expect(screen.getByText('13路')).toBeInTheDocument();
    expect(screen.getByText('9路')).toBeInTheDocument();
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

  it('対局開始ボタンでonCreateが呼ばれる', () => {
    const onCreate = vi.fn();
    render(<GameCreationDialog {...defaultProps} onCreate={onCreate} />);
    // デフォルト: black=たろう, white=はなこ（異なるので有効）
    fireEvent.click(screen.getByText('対局開始'));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        blackPlayer: 'たろう',
        whitePlayer: 'はなこ',
        boardSize: 19,
        handicap: 0,
        komi: 6.5,
      })
    );
  });

  it('同じプレイヤーを選ぶとエラーメッセージ', () => {
    render(<GameCreationDialog {...defaultProps} students={['たろう']} />);
    // students=[たろう]だけだと、black=たろう, white=三村先生（異なる）
    // 白をたろうに変更
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'たろう' } });
    expect(screen.getByText('黒と白に同じプレイヤーは選べません')).toBeInTheDocument();
  });

  it('同じプレイヤーだと対局開始ボタンが無効', () => {
    render(<GameCreationDialog {...defaultProps} students={['たろう']} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'たろう' } });
    const startBtn = screen.getByText('対局開始');
    expect(startBtn).toBeDisabled();
  });
});

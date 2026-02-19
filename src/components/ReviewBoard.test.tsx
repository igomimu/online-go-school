import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReviewBoard from './ReviewBoard';
import { createNode, addMove } from '../utils/treeUtilsV2';
import { createEmptyBoard } from '../utils/gameLogic';
import { createRef } from 'react';

const mockClassroomRef = createRef<{ broadcast: ReturnType<typeof vi.fn>, isConnected: boolean }>();

function makeTree() {
  const root = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
  const board1 = createEmptyBoard(9);
  board1[4][4] = { color: 'BLACK', number: 1 };
  const child = addMove(root, board1, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
  const board2 = createEmptyBoard(9);
  board2[4][4] = { color: 'BLACK', number: 1 };
  board2[2][2] = { color: 'WHITE', number: 2 };
  addMove(child, board2, 3, 'BLACK', 9, { x: 3, y: 3, color: 'WHITE' });
  return { root, child };
}

describe('ReviewBoard', () => {
  it('「検討モード」を表示', () => {
    const { root } = makeTree();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    expect(screen.getByText('検討モード')).toBeInTheDocument();
  });

  it('先生モードでナビゲーションボタンが表示される', () => {
    const { root } = makeTree();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('生徒モードではナビゲーションが非表示', () => {
    const { root } = makeTree();
    const { container } = render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
      />
    );
    // 先生用の描画ツール（Pen等）がない
    expect(container.querySelector('[title="線を描く"]')).not.toBeInTheDocument();
  });

  it('「ロビーに戻る」ボタン', () => {
    const { root } = makeTree();
    const onBack = vi.fn();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByText('← ロビーに戻る'));
    expect(onBack).toHaveBeenCalled();
  });

  it('手数を表示する', () => {
    const { root, child } = makeTree();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={child}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    expect(screen.getByText('1手目')).toBeInTheDocument();
  });

  it('分岐がある場合に変化選択ボタンが表示される', () => {
    const root = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
    const board1 = createEmptyBoard(9);
    board1[4][4] = { color: 'BLACK', number: 1 };
    const board2 = createEmptyBoard(9);
    board2[2][2] = { color: 'BLACK', number: 1 };
    addMove(root, board1, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    addMove(root, board2, 2, 'WHITE', 9, { x: 3, y: 3, color: 'BLACK' });

    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    expect(screen.getByText('2変化')).toBeInTheDocument();
    expect(screen.getByText(/変化1/)).toBeInTheDocument();
    expect(screen.getByText(/変化2/)).toBeInTheDocument();
  });

  it('生徒選択サイドバー（先生のみ）', () => {
    const { root } = makeTree();
    const participants = [
      { identity: '三村先生', isSpeaking: false, audioEnabled: true, videoEnabled: false },
      { identity: 'たろう', isSpeaking: false, audioEnabled: false, videoEnabled: false },
    ];
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        participants={participants}
        localIdentity="三村先生"
        targetStudents={[]}
        onSetTargetStudents={vi.fn()}
      />
    );
    expect(screen.getByText('配信先の生徒')).toBeInTheDocument();
    expect(screen.getByText('全員に配信')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
  });
});

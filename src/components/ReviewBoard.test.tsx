import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
    expect(container.querySelector('[title="フリーハンド直線を描く"]')).not.toBeInTheDocument();
  });

  it('「閉じてホーム」ボタン', () => {
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
    fireEvent.click(screen.getByText('閉じてホーム'));
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
        targetStudents={null}
        onSetTargetStudents={vi.fn()}
      />
    );
    expect(screen.getByText('検討の参加者')).toBeInTheDocument();
    expect(screen.getByText('全員に配信')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
  });

  it('PCレイアウトは碁盤と情報パネルを半分ずつ表示する', () => {
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
    expect(screen.getByTestId('review-board-column')).toHaveClass('lg:flex-1', 'lg:basis-0');
    expect(screen.getByTestId('review-info-column')).toHaveClass('lg:flex-1', 'lg:basis-0');
  });

  it('手ごとのコメント量が変わってもPCの碁盤領域へ高さを返さない', () => {
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

    expect(screen.getByTestId('review-controls')).toHaveClass(
      'lg:h-[190px]',
      'lg:shrink-0',
      'lg:overflow-y-auto',
    );
  });

  it('生徒側にも先生のAI候補手とホバー中のPVを同時表示する', () => {
    const { root } = makeTree();
    const syncedResult = {
      enabled: true,
      nodeId: root.id,
      isLoading: false,
      error: null,
      hoveredCandidateRank: 0,
      allowStudentInteraction: false,
      result: {
        winrate: 61.4,
        scoreLead: 3.2,
        topMoves: [{ move: 'D4', winrate: 61.4, scoreLead: 3.2, visits: 1000, pv: ['D4', 'E5', 'F6'] }],
      },
    };
    const { rerender } = render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
        syncedAiAnalysis={syncedResult}
      />
    );

    // 生徒側にAIのON/OFF表示・操作は出さない（解析結果だけが届く）
    expect(screen.queryByTestId('ai-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-candidate-0')).toBeInTheDocument();

    expect(screen.getByTestId('pv-stone-1')).toBeInTheDocument();
    expect(screen.getByTestId('pv-stone-2')).toBeInTheDocument();

    rerender(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
        syncedAiAnalysis={{ ...syncedResult, hoveredCandidateRank: null }}
      />
    );
    expect(screen.queryByTestId('pv-stone-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-candidate-hover-0')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('ai-move-0'));
    expect(screen.queryByTestId('pv-stone-1')).not.toBeInTheDocument();

    rerender(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
        syncedAiAnalysis={{ ...syncedResult, hoveredCandidateRank: null, allowStudentInteraction: true }}
      />
    );
    fireEvent.mouseEnter(screen.getByTestId('ai-move-0'));
    expect(screen.getByTestId('pv-stone-1')).toBeInTheDocument();
  });

  // 2026-08-04 三村さん指定: AIは動かしたまま、盤の候補手だけ消せるようにする
  // （候補手を見せて説明する場面と、見せずに読ませる場面を切り替えるため）。
  // Pocket KataGo に合わせてボタンと F キーの両方で切り替わる。
  it('講師は盤上の候補手だけをボタンとFキーで消せる（AIは止めない）', () => {
    const { root } = makeTree();
    const synced = {
      enabled: true,
      nodeId: root.id,
      isLoading: false,
      error: null,
      hoveredCandidateRank: null,
      allowStudentInteraction: false,
      result: {
        winrate: 61.4,
        scoreLead: 3.2,
        topMoves: [{ move: 'D4', winrate: 61.4, scoreLead: 3.2, visits: 1000, pv: ['D4', 'E5'] }],
      },
    };
    // 講師側の盤に候補手が出ている状態を、同期データ経由で作る
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
        syncedAiAnalysis={synced}
      />
    );
    expect(screen.getByTestId('ai-candidate-0')).toBeInTheDocument();
    cleanup();

    // 講師が消したら、生徒の盤からも消える
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
        syncedAiAnalysis={{ ...synced, showCandidates: false }}
      />
    );
    expect(screen.queryByTestId('ai-candidate-0')).not.toBeInTheDocument();
    // AI そのものは動いたままなので、解析結果の欄は残る
    expect(screen.getByText('61.4%')).toBeInTheDocument();
  });

  it('候補手ボタンは押すたびに状態が入れ替わる', () => {
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
    const button = screen.getByTestId('toggle-candidates');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(window, { key: 'f' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
  // 生徒が自分の棋譜履歴から開いた検討は、先生と同じ操作ができる（AIだけ付けない）。
  // 以前は進む・戻るのボタンもキーも isTeacher の内側にあり、生徒は並べられなかった
  // （三村さん 2026-08-13「操作キーが何も無い」）。
  describe('生徒が自分の棋譜を開いた検討', () => {
    function renderSelfReview(onSetCurrentNode = vi.fn()) {
      const { root, child } = makeTree();
      render(
        <ReviewBoard
          rootNode={root}
          currentNode={child}
          boardSize={9}
          onSetCurrentNode={onSetCurrentNode}
          isTeacher={false}
          selfReview
          classroomRef={mockClassroomRef as never}
        />
      );
      return { root, child, onSetCurrentNode };
    }

    it('進む・戻るのボタンが出る', () => {
      renderSelfReview();
      expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4);
    });

    it('キーボードでも手順を戻せる', () => {
      const onSetCurrentNode = vi.fn();
      const { root } = renderSelfReview(onSetCurrentNode);
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(onSetCurrentNode).toHaveBeenCalledWith(root);
    });

    it('先生と同じ描画ツールが使える', () => {
      renderSelfReview();
      expect(document.body.querySelector('[title="フリーハンド直線を描く"]')).toBeInTheDocument();
    });

    it('AIは付けない（分析パネルを出さない）', () => {
      renderSelfReview();
      expect(screen.queryByTestId('toggle-candidates')).not.toBeInTheDocument();
    });

    it('盤を誰にも配信しない', () => {
      const sendToOrAll = vi.fn();
      const { root, child } = makeTree();
      const ref = { current: { sendToOrAll, isConnected: true } };
      render(
        <ReviewBoard
          rootNode={root}
          currentNode={child}
          boardSize={9}
          onSetCurrentNode={vi.fn()}
          isTeacher={false}
          selfReview
          classroomRef={ref as never}
        />
      );
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(sendToOrAll).not.toHaveBeenCalled();
    });

    it('先生が配信した検討では操作できないまま', () => {
      const { root, child } = makeTree();
      const { container } = render(
        <ReviewBoard
          rootNode={root}
          currentNode={child}
          boardSize={9}
          onSetCurrentNode={vi.fn()}
          isTeacher={false}
          classroomRef={mockClassroomRef as never}
        />
      );
      expect(container.querySelector('[title="フリーハンド直線を描く"]')).not.toBeInTheDocument();
    });
  });
});

describe('ReviewBoard 手番号の切替', () => {
  it('123→全→分 の順に切り替わる（Pocket KataGo と同じ循環）', () => {
    const { root } = makeTree();
    const onChange = vi.fn();
    const props = {
      rootNode: root,
      currentNode: root,
      boardSize: 9,
      onSetCurrentNode: vi.fn(),
      isTeacher: true,
      classroomRef: mockClassroomRef as never,
      onNumberModeChange: onChange,
    };

    const { rerender } = render(<ReviewBoard {...props} numberMode="off" />);
    fireEvent.click(screen.getByTestId('cycle-number-mode'));
    expect(onChange).toHaveBeenLastCalledWith('all');

    rerender(<ReviewBoard {...props} numberMode="all" />);
    fireEvent.click(screen.getByTestId('cycle-number-mode'));
    expect(onChange).toHaveBeenLastCalledWith('branch');

    rerender(<ReviewBoard {...props} numberMode="branch" />);
    fireEvent.click(screen.getByTestId('cycle-number-mode'));
    expect(onChange).toHaveBeenLastCalledWith('off');
    cleanup();
  });

  it('「分」では検討で置いた手だけに番号が出る', () => {
    // 棋譜の1手目(5,5) → 検討で2手目(3,3)
    const { root, child } = makeTree();
    child.fromRecord = true;
    const grandChild = child.children[0];

    const { container } = render(
      <ReviewBoard
        rootNode={root}
        currentNode={grandChild}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        numberMode="branch"
      />
    );
    const texts = Array.from(container.querySelectorAll('[data-stone] text')).map(t => t.textContent);
    expect(texts).toEqual(['1']); // 棋譜の手には出ず、検討の手だけが 1
    cleanup();
  });

  it('「全」では全部の石に通し手数が出る', () => {
    const { root, child } = makeTree();
    const grandChild = child.children[0];
    const { container } = render(
      <ReviewBoard
        rootNode={root}
        currentNode={grandChild}
        boardSize={9}
        onSetCurrentNode={vi.fn()}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        numberMode="all"
      />
    );
    const texts = Array.from(container.querySelectorAll('[data-stone] text')).map(t => t.textContent).sort();
    expect(texts).toEqual(['1', '2']);
    cleanup();
  });
});

describe('ReviewBoard の書き出し', () => {
  it('メニューからSGFをコピーできる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

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
    fireEvent.click(screen.getByTestId('export-menu'));
    fireEvent.click(screen.getByTestId('copy-sgf'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('(;GM[1]FF[4]SZ[9]');
    expect(writeText.mock.calls[0][0]).toContain(';B[ee]');
    cleanup();
  });

  it('メニューに画像とSGFの4項目が出る', () => {
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
    fireEvent.click(screen.getByTestId('export-menu'));
    expect(screen.getByTestId('copy-image')).toBeInTheDocument();
    expect(screen.getByTestId('save-image')).toBeInTheDocument();
    expect(screen.getByTestId('copy-sgf')).toBeInTheDocument();
    expect(screen.getByTestId('save-sgf')).toBeInTheDocument();
    cleanup();
  });
});

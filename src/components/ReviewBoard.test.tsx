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
    // 先生用の描画ツールがない。
    // 🔴 実在するセレクタで見ること。存在しない title を not.toBeInTheDocument で見ても常に緑になる
    expect(container.querySelector('[title="矢印を描く"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="draw-curve-button"]')).not.toBeInTheDocument();
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

  it('同じ生徒IDの接続情報が重複しても参加者は1人だけ表示する', () => {
    const { root } = makeTree();
    const participants = [
      { identity: 'teacher', name: '三村九段', isSpeaking: false, audioEnabled: true, videoEnabled: false },
      { identity: 'sid:1001', name: '影山 陽翔', isSpeaking: false, audioEnabled: true, videoEnabled: false },
      { identity: 'sid:1001', name: '影山 陽翔', isSpeaking: false, audioEnabled: true, videoEnabled: false },
      { identity: 'sid:1002', name: '清水 菜奈子', isSpeaking: false, audioEnabled: true, videoEnabled: false },
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
        localIdentity="teacher"
        targetStudents={null}
        onSetTargetStudents={vi.fn()}
      />
    );

    expect(screen.getAllByText('影山 陽翔')).toHaveLength(1);
    expect(screen.getByText('清水 菜奈子')).toBeInTheDocument();
    expect(screen.getAllByTestId('review-share-sid:1001')).toHaveLength(1);
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

    it('描画ツールが使える（ただし曲線は講師だけ）', () => {
      renderSelfReview();
      // 矢印・記号は生徒も使える
      expect(document.body.querySelector('[title="矢印を描く"]')).toBeInTheDocument();
      // 曲線は講師の手元専用（2026-09-05 三村さん「生徒は使わない」）
      expect(screen.queryByTestId('draw-curve-button')).not.toBeInTheDocument();
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
      expect(container.querySelector('[title="矢印を描く"]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-testid="draw-curve-button"]')).not.toBeInTheDocument();
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

/**
 * 200手を超える棋譜で、見たい場面まで一気に飛べること。
 * 2026-08-26 三村さんの要望（Pocket KataGo と同じゲージと早送り）。
 */
describe('手順のゲージと早送り', () => {
  function makeLongTree(moves: number) {
    const root = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
    let node = root;
    for (let i = 0; i < moves; i++) {
      const board = createEmptyBoard(9);
      board[i % 9][Math.floor(i / 9) % 9] = { color: i % 2 === 0 ? 'BLACK' : 'WHITE', number: i + 1 };
      node = addMove(node, board, i + 2, i % 2 === 0 ? 'WHITE' : 'BLACK', 9, {
        x: (i % 9) + 1, y: (Math.floor(i / 9) % 9) + 1, color: i % 2 === 0 ? 'BLACK' : 'WHITE',
      });
    }
    return root;
  }

  it('ゲージを動かすと、その手数の局面へ飛ぶ', () => {
    const root = makeLongTree(30);
    const onSet = vi.fn();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={onSet}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    const bar = screen.getByTestId('review-seek-bar') as HTMLInputElement;
    expect(bar.max).toBe('30');

    fireEvent.change(bar, { target: { value: '20' } });
    expect(onSet).toHaveBeenCalledTimes(1);
    // 20手目のノードが渡る（nextNumber は手数+1）
    expect(onSet.mock.calls[0][0].nextNumber).toBe(21);
  });

  it('10手進むボタンで、10手先へ飛ぶ', () => {
    const root = makeLongTree(30);
    const onSet = vi.fn();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={onSet}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    fireEvent.click(screen.getByTitle('10手進む'));
    expect(onSet.mock.calls[0][0].nextNumber).toBe(11);
  });

  it('手順の終わりを超えて進もうとしても、最後で止まる', () => {
    const root = makeLongTree(5);
    const onSet = vi.fn();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={onSet}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );
    fireEvent.click(screen.getByTitle('10手進む'));
    // 5手しかないので5手目で止まる
    expect(onSet.mock.calls[0][0].nextNumber).toBe(6);
  });

  it('手が1つも無ければゲージは出ない', () => {
    const root = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
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
    expect(screen.queryByTestId('review-seek-bar')).toBeNull();
  });
});

/**
 * 2026-08-26 実授業: マウスホイールで手順を送ると、20手前後（シークバーで
 * 途中まで進めた後なら5、6手）で生徒への配信が止まり、以降なにも届かなく
 * なった。同じ経路のシークバーは1回で目的地へ飛ぶので最後まで届いていた。
 *
 * ホイールは一度回すと大量のイベントが飛ぶ。1件ごとに一手進めると画面の
 * 更新が積み上がって詰まる。溜めて、描画の1コマにつき1回だけ動かす。
 */
describe('ホイールの手順送り', () => {
  function makeLongTree(moves: number) {
    const root = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
    let node = root;
    for (let i = 0; i < moves; i++) {
      const board = createEmptyBoard(9);
      board[i % 9][Math.floor(i / 9) % 9] = { color: i % 2 === 0 ? 'BLACK' : 'WHITE', number: i + 1 };
      node = addMove(node, board, i + 2, i % 2 === 0 ? 'WHITE' : 'BLACK', 9, {
        x: (i % 9) + 1, y: (Math.floor(i / 9) % 9) + 1, color: i % 2 === 0 ? 'BLACK' : 'WHITE',
      });
    }
    return root;
  }

  it('ホイールを連続で回しても、手順の移動は1コマにつき1回にまとまる', async () => {
    const root = makeLongTree(30);
    const onSet = vi.fn();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={root}
        boardSize={9}
        onSetCurrentNode={onSet}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );

    const board = screen.getByTestId('go-board');
    // 一度の回転で飛んでくる量（実機では十数件が一気に来る）
    for (let i = 0; i < 15; i++) {
      fireEvent.wheel(board, { deltaY: 100 });
    }

    // まだ動かない（次の描画のコマまで溜める）
    expect(onSet).not.toHaveBeenCalled();

    // ごく短い間を置くと、まとめて15手ぶん動く
    await new Promise((r) => setTimeout(r, 150));
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(onSet.mock.calls[0][0].nextNumber).toBe(16);
  });

  it('上に回せば戻る', async () => {
    const root = makeLongTree(30);
    // 10手目から始める
    let node = root;
    for (let i = 0; i < 10; i++) node = node.children[0];

    const onSet = vi.fn();
    render(
      <ReviewBoard
        rootNode={root}
        currentNode={node}
        boardSize={9}
        onSetCurrentNode={onSet}
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
      />
    );

    const board = screen.getByTestId('go-board');
    for (let i = 0; i < 3; i++) {
      fireEvent.wheel(board, { deltaY: -100 });
    }
    await new Promise((r) => setTimeout(r, 150));

    expect(onSet).toHaveBeenCalledTimes(1);
    expect(onSet.mock.calls[0][0].nextNumber).toBe(8); // 10手目 → 7手目
  });

  // 2026-09-05 三村さん「曲線を描く機能」「検討時に講師だけに見えればいい」「生徒は使わない」
  describe('曲線（マジックペン）', () => {
    function drawStroke(board: HTMLElement) {
      // jsdom は矩形を返さないので、盤の大きさを与えてから指を動かす
      vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      fireEvent.pointerDown(board, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 40, clientY: 40 });
      fireEvent.pointerMove(board, { pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 90 });
      fireEvent.pointerMove(board, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 160 });
      fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse' });
    }

    it('講師にはボタンが出る', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={mockClassroomRef as never} />
      );
      expect(screen.getByTestId('draw-curve-button')).toBeInTheDocument();
    });

    it('自分の棋譜を並べている生徒にはボタンを出さない', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={false} selfReview classroomRef={mockClassroomRef as never} />
      );
      expect(screen.queryByTestId('draw-curve-button')).not.toBeInTheDocument();
    });

    it('なぞった軌跡が曲線として盤に残る', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={mockClassroomRef as never} />
      );
      fireEvent.click(screen.getByTestId('draw-curve-button'));
      drawStroke(screen.getByTestId('go-board'));
      expect(screen.getAllByTestId('board-free-drawing')).toHaveLength(1);
    });

    it('曲線モードにしていなければ描かれない', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={mockClassroomRef as never} />
      );
      drawStroke(screen.getByTestId('go-board'));
      expect(screen.queryByTestId('board-free-drawing')).not.toBeInTheDocument();
    });

    it('🔴 曲線は生徒へ配信しない（講師の手元だけ）', () => {
      const { root } = makeTree();
      const sendToOrAll = vi.fn();
      const ref = { current: { sendToOrAll, broadcast: vi.fn(), isConnected: true } };
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={ref as never} targetStudents={null} />
      );
      fireEvent.click(screen.getByTestId('draw-curve-button'));
      drawStroke(screen.getByTestId('go-board'));

      expect(screen.getAllByTestId('board-free-drawing')).toHaveLength(1);
      const drawUpdates = sendToOrAll.mock.calls.filter(([msg]) => msg?.type === 'DRAW_UPDATE');
      expect(drawUpdates).toHaveLength(0);
    });
  });

  // 2026-09-06 三村さん「共有検討画面に、棋譜を開くボタンを」
  describe('棋譜を開く', () => {
    const openProps = {
      onOpenSgfText: vi.fn(),
      onOpenSavedGame: vi.fn(),
      onOpenProblem: vi.fn(),
    };

    it('講師には「開く」が出て、押すと窓が出る', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={mockClassroomRef as never}
          registeredStudents={[]} {...openProps} />
      );
      fireEvent.click(screen.getByTestId('open-record-button'));
      const dialog = screen.getByTestId('review-open-dialog');
      expect(dialog).toBeInTheDocument();
      // 3つの入口がそろっている（生徒の対局・SGF・詰碁）
      expect(screen.getByTestId('review-open-student')).toBeInTheDocument();
      expect(screen.getByTestId('review-open-sgf')).toBeInTheDocument();
      expect(screen.getByTestId('review-open-tsumego')).toBeInTheDocument();
    });

    it('自分の棋譜を並べている生徒には出さない', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={false} selfReview classroomRef={mockClassroomRef as never}
          registeredStudents={[]} {...openProps} />
      );
      expect(screen.queryByTestId('open-record-button')).not.toBeInTheDocument();
    });

    it('開く手立てが渡されていなければボタンを出さない', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={mockClassroomRef as never} />
      );
      expect(screen.queryByTestId('open-record-button')).not.toBeInTheDocument();
    });

    it('窓は閉じられる', () => {
      const { root } = makeTree();
      render(
        <ReviewBoard rootNode={root} currentNode={root} boardSize={9}
          onSetCurrentNode={vi.fn()} isTeacher={true} classroomRef={mockClassroomRef as never}
          registeredStudents={[]} {...openProps} />
      );
      fireEvent.click(screen.getByTestId('open-record-button'));
      fireEvent.click(screen.getByLabelText('閉じる'));
      expect(screen.queryByTestId('review-open-dialog')).not.toBeInTheDocument();
    });
  });
});

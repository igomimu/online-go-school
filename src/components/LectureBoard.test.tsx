import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LectureBoard from './LectureBoard';
import { createNode } from '../utils/treeUtilsV2';
import { createEmptyBoard } from '../utils/gameLogic';
import { createRef } from 'react';

// ClassroomLiveKitのモック
const mockClassroomRef = createRef<{ broadcast: ReturnType<typeof vi.fn>, isConnected: boolean }>();

describe('LectureBoard', () => {
  it('先生モードで「授業モード」を表示', () => {
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
      />
    );
    expect(screen.getByText('授業モード')).toBeInTheDocument();
  });

  it('先生モードでナビゲーションボタンが表示される', () => {
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
      />
    );
    // ナビゲーションボタン（lucide icons のボタン）が複数存在
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4); // 最低でもナビ4つ + 描画2つ
  });

  it('先生モードで碁盤サイズ選択が表示される', () => {
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
      />
    );
    expect(screen.getByText('碁盤設定')).toBeInTheDocument();
    expect(screen.getByText('碁盤サイズ')).toBeInTheDocument();
    // サイズボタン（碁盤の座標にも数字があるのでgetAllByで確認）
    const btn19 = screen.getAllByText('19').find(el => el.tagName === 'BUTTON');
    expect(btn19).toBeTruthy();
    const btn9 = screen.getAllByText('9').find(el => el.tagName === 'BUTTON');
    expect(btn9).toBeTruthy();
  });

  it('先生モードで「碁盤をリセット」ボタン', () => {
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
      />
    );
    expect(screen.getByText('碁盤をリセット')).toBeInTheDocument();
  });

  it('先生モードで「SGFファイルを読込」ボタン', () => {
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
      />
    );
    expect(screen.getByText('SGFファイルを読込')).toBeInTheDocument();
  });

  it('生徒モードではサイドバー・ナビが非表示', () => {
    const syncedNode = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
    render(
      <LectureBoard
        isTeacher={false}
        classroomRef={mockClassroomRef as never}
        userName="たろう"
        syncedNode={syncedNode}
        syncedBoardSize={9}
      />
    );
    expect(screen.getByText('授業モード')).toBeInTheDocument();
    expect(screen.queryByText('碁盤設定')).not.toBeInTheDocument();
    expect(screen.queryByText('SGFファイルを読込')).not.toBeInTheDocument();
  });

  it('「ロビーに戻る」ボタン', () => {
    const onBack = vi.fn();
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByText('← ロビーに戻る'));
    expect(onBack).toHaveBeenCalled();
  });

  it('手数カウンターを表示', () => {
    render(
      <LectureBoard
        isTeacher={true}
        classroomRef={mockClassroomRef as never}
        userName="三村先生"
      />
    );
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });
});

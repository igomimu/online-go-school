import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecordSaveDialog from './RecordSaveDialog';
import type { Student } from '../types/classroom';

const students: Student[] = [
  { id: '1010', name: 'たろう' } as Student,
  { id: '1011', name: 'はなこ' } as Student,
];

describe('RecordSaveDialog', () => {
  it('生徒は自分の色を選ぶだけで、自分側は identity で保存される', () => {
    const onSave = vi.fn();
    render(
      <RecordSaveDialog
        role="STUDENT"
        myIdentity="sid:1010"
        myName="たろう"
        boardSize={19}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('record-opponent-name'), { target: { value: 'ゆうごの相手' } });
    fireEvent.change(screen.getByTestId('record-date'), { target: { value: '2026-09-06' } });
    fireEvent.click(screen.getByTestId('record-save-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-09-06',
      blackPlayer: 'sid:1010',
      whitePlayer: 'ゆうごの相手',
    }));
  });

  it('生徒が白番を選ぶと、黒白が入れ替わる', () => {
    const onSave = vi.fn();
    render(
      <RecordSaveDialog
        role="STUDENT"
        myIdentity="sid:1010"
        myName="たろう"
        boardSize={19}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('record-opponent-name'), { target: { value: 'あいて' } });
    fireEvent.click(screen.getByTestId('record-my-color-WHITE'));
    fireEvent.click(screen.getByTestId('record-save-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      blackPlayer: 'あいて',
      whitePlayer: 'sid:1010',
    }));
  });

  it('相手の名前が空のままでは保存できない', () => {
    const onSave = vi.fn();
    render(
      <RecordSaveDialog
        role="STUDENT"
        myIdentity="sid:1010"
        myName="たろう"
        boardSize={19}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('record-save-submit'));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('先生は名簿から対局者を選べる', () => {
    const onSave = vi.fn();
    render(
      <RecordSaveDialog
        role="TEACHER"
        students={students}
        boardSize={19}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('record-black-select'), { target: { value: 'sid:1010' } });
    fireEvent.change(screen.getByTestId('record-white-select'), { target: { value: 'sid:1011' } });
    fireEvent.click(screen.getByTestId('record-save-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      blackPlayer: 'sid:1010',
      whitePlayer: 'sid:1011',
    }));
  });

  it('読み込んだSGFの対局者・日付・結果が初期値に入る', () => {
    const onSave = vi.fn();
    render(
      <RecordSaveDialog
        role="TEACHER"
        students={students}
        boardSize={19}
        initial={{ blackPlayer: '三村智保', whitePlayer: '相手', date: '2026-08-30', result: '黒中押し勝ち', komi: 0.5, handicap: 3 }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('record-black-name')).toHaveValue('三村智保');
    expect(screen.getByTestId('record-date')).toHaveValue('2026-08-30');
    expect(screen.getByTestId('record-result')).toHaveValue('黒中押し勝ち');
    expect(screen.getByTestId('record-komi')).toHaveValue('0.5');

    fireEvent.click(screen.getByTestId('record-save-submit'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      blackPlayer: '三村智保',
      whitePlayer: '相手',
      komi: 0.5,
      handicap: 3,
    }));
  });

  it('保存できなかったときは理由を出す', () => {
    render(
      <RecordSaveDialog
        role="STUDENT"
        myIdentity="sid:1010"
        myName="たろう"
        boardSize={19}
        error="保存できませんでした: row-level security"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('row-level security');
  });
});

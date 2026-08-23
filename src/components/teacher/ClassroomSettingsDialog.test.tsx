import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';
import type { Classroom, Student } from '../../types/classroom';
import { replaceStudentTypes, upsertClassroom } from '../../utils/classroomStore';

vi.mock('../../utils/classroomStore', () => ({
  replaceStudentTypes: vi.fn(async () => {}),
  upsertClassroom: vi.fn(async () => {}),
}));

const classroom: Classroom = {
  id: 'CLS001',
  name: 'ネット教室',
  maxCapacity: 10,
  studentIds: ['S001'],
};

const student: Student = {
  id: 'S001',
  name: '鈴木榛人',
  rank: '初段',
  internalRating: 'R5',
  type: 'ネット生',
  grade: '小6',
  country: '千葉県',
};

describe('ClassroomSettingsDialog 生徒区分', () => {
  it('区分名の変更を元名称付きで保存する', async () => {
    const onSave = vi.fn();
    render(
      <ClassroomSettingsDialog
        classroom={classroom}
        allStudents={[student]}
        studentTypes={['ネット生', '教室生']}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '生徒区分 1' }), { target: { value: 'オンライン生' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(replaceStudentTypes).toHaveBeenCalledWith([
      { originalName: 'ネット生', name: 'オンライン生' },
      { originalName: '教室生', name: '教室生' },
    ]));
    expect(upsertClassroom).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
  });

  it('使用中の区分は確認後に削除し、保存対象から外す', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ClassroomSettingsDialog
        classroom={classroom}
        allStudents={[student]}
        studentTypes={['ネット生', '教室生']}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ネット生を削除' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('該当生徒の区分は「未設定」になります'));
    expect(screen.getByRole('textbox', { name: '生徒区分 1' })).toHaveValue('教室生');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(replaceStudentTypes).toHaveBeenCalledWith([
      { originalName: '教室生', name: '教室生' },
    ]));
  });
});

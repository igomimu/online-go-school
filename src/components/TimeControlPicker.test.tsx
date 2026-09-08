import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TimeSettings } from '../hooks/useGameClock';
import { DEFAULT_BYOYOMI_TIME_SETTINGS, DEFAULT_TIME_SETTINGS } from '../hooks/useGameClock';
import TimeControlPicker from './TimeControlPicker';

function Picker({ initial = DEFAULT_TIME_SETTINGS }: { initial?: TimeSettings }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TimeControlPicker value={value} onChange={setValue} />
      <output data-testid="settings">{JSON.stringify(value)}</output>
    </>
  );
}

describe('TimeControlPicker', () => {
  it('初期状態は30分・秒読みなし', () => {
    render(<Picker />);
    expect(screen.getByTestId('settings')).toHaveTextContent('"mainMinutes":30');
    expect(screen.getByTestId('settings')).toHaveTextContent('"byoyomiEnabled":false');
    expect(screen.getByRole('button', { name: 'なし' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('秒読みありを選ぶと、持ち時間0分・3回・30秒へ切り替える', () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: 'あり' }));
    expect(screen.getByTestId('settings')).toHaveTextContent(JSON.stringify(DEFAULT_BYOYOMI_TIME_SETTINGS));
  });

  it('入力済みの持ち時間は秒読みなしを選んでも上書きしない', () => {
    render(<Picker initial={{ ...DEFAULT_BYOYOMI_TIME_SETTINGS, mainMinutes: 15 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'なし' }));
    expect(screen.getByTestId('settings')).toHaveTextContent('"mainMinutes":15');
  });
});

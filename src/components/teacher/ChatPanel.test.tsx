import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatPanel from './ChatPanel';

/**
 * 日本語入力の変換確定 Enter で送信されない、という一点を守るテスト。
 * 「けんとう」を変換して確定した瞬間にチャットが飛んでいた（2026-09-07 Codex レビュー #5）。
 */
function renderPanel(onSend = vi.fn()) {
  render(
    <ChatPanel
      messages={[]}
      participants={[]}
      students={[]}
      localIdentity="teacher"
      onSend={onSend}
    />,
  );
  const input = screen.getByLabelText('チャットのメッセージ');
  return { onSend, input };
}

describe('ChatPanel の Enter', () => {
  it('変換中の Enter では送信しない', () => {
    const { onSend, input } = renderPanel();
    fireEvent.change(input, { target: { value: '検討' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('isComposing が立たないブラウザ向けに keyCode 229 でも送信しない', () => {
    const { onSend, input } = renderPanel();
    fireEvent.change(input, { target: { value: '検討' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('変換していない Enter では送信する', () => {
    const { onSend, input } = renderPanel();
    fireEvent.change(input, { target: { value: '検討' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('検討', 'all');
  });

  it('Shift+Enter では送信しない', () => {
    const { onSend, input } = renderPanel();
    fireEvent.change(input, { target: { value: '検討' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});

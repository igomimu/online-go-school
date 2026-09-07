import type { GameNode } from './treeUtilsV2';

/**
 * いま見ている手順の全体。ここまで来た道（ルート→現在）と、
 * この先の続き（主分岐）をつないだもの。
 * 分岐に入っていても「今いる筋」がそのまま並ぶので、ゲージがずれない。
 *
 * 🔴 検討盤（先生・自分の検討）と、着手を許された生徒からの「◯手目へ」の
 * 受け取り（App）で同じ数え方を使う。別々に数えると、生徒が指した手数と
 * 先生の盤が飛ぶ先がずれる。
 */
export interface ReviewTimeline {
  nodes: GameNode[];
  index: number;
}

export function getReviewTimeline(current: GameNode): ReviewTimeline {
  const behind: GameNode[] = [];
  let back: GameNode | null = current;
  while (back) { behind.unshift(back); back = back.parent; }
  const ahead: GameNode[] = [];
  let fwd = current;
  while (fwd.children.length > 0) { fwd = fwd.children[0]; ahead.push(fwd); }
  return { nodes: [...behind, ...ahead], index: behind.length - 1 };
}

/** 手順の何番目かを指して、その局面のノードを返す。範囲外は端で止める */
export function nodeAtReviewIndex(current: GameNode, index: number): GameNode | null {
  const timeline = getReviewTimeline(current);
  const clamped = Math.max(0, Math.min(timeline.nodes.length - 1, Math.trunc(index)));
  return timeline.nodes[clamped] ?? null;
}

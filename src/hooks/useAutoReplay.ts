import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameNode } from '../utils/treeUtilsV2';

export type ReplaySpeed = 0.5 | 1 | 2 | 3 | 5;

export const REPLAY_SPEEDS: { label: string; value: ReplaySpeed }[] = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '3x', value: 3 },
  { label: '5x', value: 5 },
];

export function useAutoReplay(
  currentNode: GameNode,
  onSetCurrentNode: (node: GameNode) => void,
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const nodeRef = useRef(currentNode);
  nodeRef.current = currentNode;

  const intervalMs = 1000 / speed;

  const stop = useCallback(() => setIsPlaying(false), []);

  const play = useCallback(() => {
    if (nodeRef.current.children.length === 0) return;
    setIsPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  }, [isPlaying, play, stop]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      const node = nodeRef.current;
      if (node.children.length > 0) {
        onSetCurrentNode(node.children[0]);
      } else {
        // Reached end of game
        setIsPlaying(false);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, intervalMs, onSetCurrentNode]);

  return {
    isPlaying,
    speed,
    setSpeed,
    play,
    stop,
    toggle,
  };
}

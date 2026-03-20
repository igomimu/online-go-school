import { useState, useEffect, useRef, useCallback } from 'react';
import type { AiAnalysisResult, AiSettings } from '../types/ai';
import type { GameNode } from '../utils/treeUtilsV2';
import { analyzePosition, convertMovesToKatago, loadAiSettings, saveAiSettings } from '../utils/katagoClient';

interface UseAiAnalysisOptions {
  boardSize: number;
  komi: number;
  handicapStones?: { x: number; y: number }[];
}

export function useAiAnalysis(
  currentNode: GameNode | null,
  moveHistory: { x: number; y: number; color: 'BLACK' | 'WHITE' }[],
  options: UseAiAnalysisOptions,
) {
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());

  // Cache: nodeId -> result
  const cacheRef = useRef(new Map<string, AiAnalysisResult>());
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSettings = useCallback((newSettings: Partial<AiSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      saveAiSettings(updated);
      return updated;
    });
  }, []);

  // Analyze when node changes (debounced)
  useEffect(() => {
    if (!settings.enabled || !currentNode) {
      setResult(null);
      setError(null);
      return;
    }

    const nodeId = currentNode.id;

    // Check cache
    const cached = cacheRef.current.get(nodeId);
    if (cached) {
      setResult(cached);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Debounce: wait 300ms before sending request
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      // Abort previous request
      if (abortRef.current) abortRef.current.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      const katagoMoves = convertMovesToKatago(moveHistory, options.boardSize);
      const initialStones = options.handicapStones?.map(s => {
        const col = s.x >= 9
          ? String.fromCharCode(64 + s.x + 1)
          : String.fromCharCode(64 + s.x);
        const row = options.boardSize - s.y + 1;
        return ['B', `${col}${row}`] as [string, string];
      });

      analyzePosition({
        moves: katagoMoves,
        boardSize: options.boardSize,
        komi: options.komi,
        maxVisits: settings.maxVisits,
        initialStones: initialStones?.length ? initialStones : undefined,
      }, settings.serverUrl, controller.signal)
        .then(res => {
          if (!controller.signal.aborted) {
            cacheRef.current.set(nodeId, res);
            // Keep cache size reasonable
            if (cacheRef.current.size > 200) {
              const firstKey = cacheRef.current.keys().next().value;
              if (firstKey) cacheRef.current.delete(firstKey);
            }
            setResult(res);
            setIsLoading(false);
          }
        })
        .catch(err => {
          if (!controller.signal.aborted) {
            setError(err.message);
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentNode?.id, settings.enabled, settings.serverUrl, settings.maxVisits, moveHistory, options.boardSize, options.komi, options.handicapStones]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    result,
    isLoading,
    error,
    settings,
    updateSettings,
    clearCache,
  };
}

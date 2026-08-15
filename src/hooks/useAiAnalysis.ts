import { useState, useEffect, useRef, useCallback } from 'react';
import type { AiAnalysisRequest, AiAnalysisResult, AiSettings } from '../types/ai';
import type { GameNode } from '../utils/treeUtilsV2';
import { analyzePosition, convertMovesToKatago, loadAiSettings, saveAiSettings } from '../utils/katagoClient';

interface UseAiAnalysisOptions {
  boardSize: number;
  komi: number;
  initialStones?: { x: number; y: number; color: 'BLACK' | 'WHITE' }[];
  toPlay?: 'BLACK' | 'WHITE';
  active?: boolean;
}

/** KataGoの「次に打つ側」基準の応答を、画面表示用の黒基準へ統一する。 */
export function normalizeAiResultForBlack(
  result: AiAnalysisResult,
  toPlay: 'BLACK' | 'WHITE',
): AiAnalysisResult {
  if (toPlay === 'BLACK') return result;
  return {
    ...result,
    winrate: 100 - result.winrate,
    scoreLead: -result.scoreLead,
    topMoves: result.topMoves.map(move => ({
      ...move,
      winrate: 100 - move.winrate,
      scoreLead: -move.scoreLead,
    })),
  };
}

export function useAiAnalysis(
  currentNode: GameNode | null,
  moveHistory: { x: number; y: number; color: 'BLACK' | 'WHITE' }[],
  options: UseAiAnalysisOptions,
) {
  const [resultState, setResultState] = useState<{ key: string; result: AiAnalysisResult } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());

  const inferredToPlay: 'BLACK' | 'WHITE' = options.toPlay
    ?? (moveHistory.length > 0
      ? (moveHistory[moveHistory.length - 1].color === 'BLACK' ? 'WHITE' : 'BLACK')
      : (options.initialStones?.some(stone => stone.color === 'BLACK') ? 'WHITE' : 'BLACK'));

  // Cache: 局面・分析条件を含む安定キー -> result
  const cacheRef = useRef(new Map<string, AiAnalysisResult>());

  const updateSettings = useCallback((newSettings: Partial<AiSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      saveAiSettings(updated);
      return updated;
    });
  }, []);

  // 配列・オブジェクトの参照ではなく内容からキーを作る。
  // Reactの再レンダーでmoveHistoryが同内容の新配列になっても、同じ局面を再送しない。
  const analysisKey = options.active !== false && settings.enabled && currentNode
    ? JSON.stringify({
        nodeId: currentNode.id,
        request: {
          moves: convertMovesToKatago(moveHistory, options.boardSize),
          boardSize: options.boardSize,
          komi: options.komi,
          maxVisits: settings.maxVisits,
          initialStones: options.initialStones?.map(s => {
            const col = s.x >= 9
              ? String.fromCharCode(64 + s.x + 1)
              : String.fromCharCode(64 + s.x);
            const row = options.boardSize - s.y + 1;
            return [s.color === 'BLACK' ? 'B' : 'W', `${col}${row}`] as [string, string];
          }),
        } satisfies AiAnalysisRequest,
        toPlay: inferredToPlay,
      })
    : null;

  // Analyze when the semantic position changes (debounced)
  useEffect(() => {
    if (!analysisKey) return;

    const parsed = JSON.parse(analysisKey) as { request: AiAnalysisRequest; toPlay: 'BLACK' | 'WHITE' };

    // Check cache
    const cached = cacheRef.current.get(analysisKey);
    if (cached) {
      queueMicrotask(() => {
        setResultState(prev => prev?.key === analysisKey ? prev : { key: analysisKey, result: cached });
        setErrorState(null);
        setLoadingKey(null);
      });
      return;
    }

    let controller: AbortController | null = null;
    const debounce = setTimeout(() => {
      controller = new AbortController();
      const activeController = controller;

      setLoadingKey(analysisKey);
      setErrorState(null);

      // Pocket KataGoと同じ二段階解析。まず10 visitsの速報を表示し、
      // 続けて設定値まで深く読む。深い解析中も速報の候補手を操作できる。
      const runAnalysis = async () => {
        try {
          const quickVisits = Math.min(10, parsed.request.maxVisits);
          const quickRawResult = await analyzePosition(
            { ...parsed.request, maxVisits: quickVisits },
            activeController.signal,
          );
          if (activeController.signal.aborted) return;
          const quickResult = normalizeAiResultForBlack(quickRawResult, parsed.toPlay);
          setResultState({ key: analysisKey, result: quickResult });

          let finalResult = quickResult;
          if (parsed.request.maxVisits > quickVisits) {
            const deepRawResult = await analyzePosition(parsed.request, activeController.signal);
            if (activeController.signal.aborted) return;
            finalResult = normalizeAiResultForBlack(deepRawResult, parsed.toPlay);
            setResultState({ key: analysisKey, result: finalResult });
          }

          cacheRef.current.set(analysisKey, finalResult);
          if (cacheRef.current.size > 200) {
            const firstKey = cacheRef.current.keys().next().value;
            if (firstKey) cacheRef.current.delete(firstKey);
          }
          setLoadingKey(prev => (prev === analysisKey ? null : prev));
        } catch (err) {
          if (!activeController.signal.aborted) {
            const message = err instanceof Error ? err.message : 'AI分析に失敗しました';
            setErrorState({ key: analysisKey, message });
            setLoadingKey(prev => (prev === analysisKey ? null : prev));
          }
        }
      };
      void runAnalysis();
    }, 50);

    return () => {
      clearTimeout(debounce);
      controller?.abort();
    };
  }, [analysisKey]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    result: resultState?.key === analysisKey ? resultState.result : null,
    isLoading: loadingKey === analysisKey,
    error: errorState?.key === analysisKey ? errorState.message : null,
    settings,
    updateSettings,
    clearCache,
  };
}

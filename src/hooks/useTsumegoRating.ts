import { useCallback, useEffect, useRef, useState } from 'react';
import type { Problem } from '../types/problem';
import type { RatingUpdateResult, TsumegoRatingState } from '../types/tsumegoRating';
import {
  createInitialRatingState,
  loadTsumegoRatingFromStorage,
  pickRandomLevelForRank,
  saveTsumegoRatingToStorage,
} from '../utils/tsumegoRating';
import {
  loadTsumegoRatingFromServer,
  recordTsumegoResultOnServer,
  startTsumegoRatingOnServer,
} from '../utils/tsumegoRatingStore';
import { fetchRandomTsumegoProblem } from '../utils/tsumegoApi';
import { tsumegoRowToProblem } from '../utils/tsumegoConvert';

export interface UseTsumegoRatingOptions {
  /** 生徒として入っているときだけ動かす */
  enabled: boolean;
  /** アカウントの生徒ID。無ければ端末の中だけで格付けする */
  studentId: string | null;
  /** 生徒IDが無いときの端末キャッシュの鍵 */
  userName: string;
  /** 格に合った問題が用意できた（画面を詰碁に切り替える） */
  onProblemReady: (problem: Problem) => void;
}

export interface UseTsumegoRatingResult {
  rating: TsumegoRatingState | null;
  showInitialRankDialog: boolean;
  closeInitialRankDialog: () => void;
  startError: string;
  clearStartError: () => void;
  /** 講師から格付け出題が届いた。接続時に作ったハンドラから呼んでも最新の格を使う（参照は変わらない） */
  handleIncomingRatingProblem: (baseProblem: Problem) => Promise<void>;
  retry: () => void;
  selectInitialRank: (rankId: string) => Promise<void>;
  handleRatingUpdate: (result: RatingUpdateResult) => void;
}

/**
 * 詰碁の格付けチャレンジ（生徒側）。
 *
 * 格付けの正本はアカウント（サーバーの関数が計算する）。端末の localStorage は先に表示するためだけに使う。
 * - 🔴 出題の受け口は教室の接続時に作ったハンドラから呼ばれる。state を閉じ込めると入室時の格で
 *   問題を選び続けたので、最新の格は ref から読む（2026-09-27）
 * - 🔴 アカウントの格を読み終わるまで初期格の選択を出さない。出すと別の端末で育てた格を
 *   新しい端末の初期選択で上書きした（2026-09-27）
 * - 🔴 端末キャッシュの鍵は生徒IDだけ。ID が分かる前に生徒コードの鍵で書くと、ID 確定で鍵が変わって
 *   表示が消え、仮の鍵のデータが取り残された（2026-09-27）
 */
export function useTsumegoRating({
  enabled,
  studentId,
  userName,
  onProblemReady,
}: UseTsumegoRatingOptions): UseTsumegoRatingResult {
  const [rating, setRating] = useState<TsumegoRatingState | null>(null);
  const [showInitialRankDialog, setShowInitialRankDialog] = useState(false);
  const [startError, setStartError] = useState('');

  const scope = studentId || userName || '';
  const ratingRef = useRef<TsumegoRatingState | null>(null);
  const accountLoadRef = useRef<Promise<TsumegoRatingState | null> | null>(null);
  // 送信中の結果の数。0 になるまでサーバーの返事で表示を巻き戻さない
  const pendingRecordsRef = useRef(0);
  // 講師から届いた格付け出題（初期格の選択・再試行のあとに使う）
  const pendingProblemRef = useRef<Problem | null>(null);
  const onProblemReadyRef = useRef(onProblemReady);
  useEffect(() => { onProblemReadyRef.current = onProblemReady; }, [onProblemReady]);

  const applyRating = useCallback((next: TsumegoRatingState | null, key: string) => {
    ratingRef.current = next;
    setRating(next);
    if (next && key) saveTsumegoRatingToStorage(next, key);
  }, []);

  const loadAccount = useCallback((id: string, key: string) => {
    const load = loadTsumegoRatingFromServer(id).then(remote => {
      if (accountLoadRef.current === load) applyRating(remote, key);
      return remote;
    });
    accountLoadRef.current = load;
    load.catch(err => {
      console.warn('[tsumego-rating] アカウントの格付けを取得できませんでした', err);
      if (accountLoadRef.current === load) accountLoadRef.current = null;
    });
    return load;
  }, [applyRating]);

  useEffect(() => {
    if (!enabled || !scope) return;
    // 同じブラウザで別の生徒へ切り替えたとき、前の生徒の格を引き継がない。
    // 生徒が変わった時点で表示を入れ替えるための setState なので effect の中で呼ぶ
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyRating(loadTsumegoRatingFromStorage(scope), scope);
    accountLoadRef.current = null;
    if (studentId) void loadAccount(studentId, scope).catch(() => {});
  }, [enabled, studentId, scope, applyRating, loadAccount]);

  const startProblem = useCallback(async (current: TsumegoRatingState, baseProblem?: Problem) => {
    setStartError('');
    try {
      const level = pickRandomLevelForRank(current.rankId);
      const row = await fetchRandomTsumegoProblem({ level, boardSize: 19 });
      if (!row) {
        setStartError('この格に合う詰碁が見つかりませんでした。先生に知らせてください。');
        return;
      }
      const p = tsumegoRowToProblem(row);
      p.lives = baseProblem?.lives ?? 3;
      p.timeLimitSec = baseProblem?.timeLimitSec;
      p.ratingMode = true;
      pendingProblemRef.current = null;
      onProblemReadyRef.current(p);
    } catch (err) {
      console.error('Failed to start rating problem:', err);
      setStartError('詰碁を取得できませんでした。通信を確認して、もう一度試してください。');
    }
  }, []);

  const incoming = useCallback(async (baseProblem: Problem) => {
    pendingProblemRef.current = baseProblem;
    setStartError('');
    if (studentId) {
      try {
        // 読み込み中ならそれを待つ。失敗したら（前の失敗も含めて）一度だけ読み直す
        try {
          await (accountLoadRef.current ?? loadAccount(studentId, scope));
        } catch {
          await loadAccount(studentId, scope);
        }
      } catch {
        setStartError('格付けを読み込めませんでした。通信を確認して、もう一度試してください。');
        return;
      }
    }
    const current = ratingRef.current;
    if (!current) {
      setShowInitialRankDialog(true);
      return;
    }
    await startProblem(current, baseProblem);
  }, [studentId, scope, loadAccount, startProblem]);
  const incomingRef = useRef(incoming);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);
  const handleIncomingRatingProblem = useCallback((baseProblem: Problem) => incomingRef.current(baseProblem), []);

  const retry = useCallback(() => {
    const pending = pendingProblemRef.current;
    const current = ratingRef.current;
    if (pending) void incomingRef.current(pending);
    else if (current) void startProblem(current);
  }, [startProblem]);

  const selectInitialRank = useCallback(async (rankId: string) => {
    setShowInitialRankDialog(false);
    let initial: TsumegoRatingState;
    if (studentId) {
      try {
        // すでにアカウントに格があれば、サーバーはそれを変えずに返す
        initial = await startTsumegoRatingOnServer(rankId);
      } catch (err) {
        console.warn('[tsumego-rating] 格付けを始められませんでした', err);
        setStartError('格付けを始められませんでした。通信を確認して、もう一度試してください。');
        return;
      }
    } else {
      initial = createInitialRatingState(rankId);
    }
    applyRating(initial, scope);
    await startProblem(initial, pendingProblemRef.current ?? undefined);
  }, [studentId, scope, applyRating, startProblem]);

  const handleRatingUpdate = useCallback((result: RatingUpdateResult) => {
    // 画面にはすぐ出し、アカウントには結果だけを送る。格はサーバーが計算した値を正本にする
    applyRating(result.nextState, scope);
    if (!studentId) return;
    pendingRecordsRef.current += 1;
    const key = scope;
    void recordTsumegoResultOnServer(result.isCorrect)
      .then(server => {
        pendingRecordsRef.current -= 1;
        if (pendingRecordsRef.current === 0) applyRating(server, key);
      })
      .catch(err => {
        pendingRecordsRef.current -= 1;
        console.warn('[tsumego-rating] 結果をアカウントへ送れませんでした', err);
      });
  }, [studentId, scope, applyRating]);

  return {
    rating,
    showInitialRankDialog,
    closeInitialRankDialog: useCallback(() => setShowInitialRankDialog(false), []),
    startError,
    clearStartError: useCallback(() => setStartError(''), []),
    handleIncomingRatingProblem,
    retry,
    selectInitialRank,
    handleRatingUpdate,
  };
}

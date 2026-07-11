# 自殺手・コウ判定の配線 実装指示書（2026-07-11 設計: Claude Fable 5 / 実装: 他AI / 検証: Claude）

対局で自殺手とコウ（劫の即取り返し）が打れてしまう。三村さん指定で**必須**。

## 0. 大前提（毎回同じ。違反は差し戻し）

- **サーバー側（Edge Functions / DB / RLS）は変更しない**。submit_move は合法手判定を
  クライアントに委ねる設計（コメント参照）。クライアントの着手関門で止めるのが正。
- dojo-app リポジトリの supabase/functions を触らない。
- setState の updater 関数に副作用を入れない。
- 作業前に `git fetch origin`、完了は commit+push まで。検証役（Claude）が diff 精読＋
  E2E 独立実行で合否判定する。

## 1. 最重要: 判定ロジックは既に存在する。新規に書くな

`src/utils/gameLogic.ts` の **`isLegalMove(board, x, y, color, size, lastBoardHash?)`** が
空点・自殺手（取り石があれば合法）・コウ（`boardHash` 比較）を全部実装済み。
**ただし現在どこからも呼ばれていない**（旧ローカル対局時代の遺産）。
やることはこれを唯一の着手関門 `useLiveGame.submitMoveFn` に配線すること。
同等ロジックの再実装・コピーは禁止（レビューで差し戻す）。

## 2. 実装

### 2-1. コウ参照ハッシュの導出（純関数として export）

`src/hooks/useLiveGame.ts` に追加:

```ts
// コウ判定の参照位置 = 相手の直前の着手が打たれる前の盤面（2手前の局面）。
// 着手後の盤面がこれと一致する手は簡易コウ（即取り返し）として禁止。
// 直前手がパスならこの比較は自然に成立しない（自分の着手で必ず石が増えるため）＝パスでコウが解除される。
export function koReferenceHash(game: LiveGameRow, moves: LiveMoveRow[]): string | undefined {
  if (moves.length === 0) return undefined;
  return boardHash(deriveBoardState(game, moves.slice(0, -1)).boardState);
}
```

- `boardHash` は gameLogic から import。
- 置石対局でも `deriveBoardState` が置石込みで盤面を作るので正しい。

### 2-2. submitMoveFn への配線

現在の関門（2026-07-11 に入れた占有チェック）:

```ts
      // 合法手チェック: 既に石がある交点には打てない
      // （submit_move は合法手判定をクライアントに委ねているため、ここが唯一の関門）
      if (x < 1 || y < 1 || x > activeGame.board_size || y > activeGame.board_size) return;
      if (derived.boardState[y - 1]?.[x - 1]) return;
```

これを以下に置き換える（**盤外チェックは残す**。isLegalMove は盤外を想定していない）:

```ts
      // 合法手チェック: 空点・自殺手・コウ（submit_move は合法手判定をクライアントに
      // 委ねているため、ここが唯一の関門）
      if (x < 1 || y < 1 || x > activeGame.board_size || y > activeGame.board_size) return;
      if (!isLegalMove(derived.boardState, x, y, effectivePlayer.color, activeGame.board_size, koReferenceHash(activeGame, moves))) {
        return;
      }
```

- `moves` は hook 内の state（derived と同じソース）。useCallback の deps に `moves` を追加
  （`derived.boardState` は既に入っている。moves 追加による再生成は毎手発生するが、
  盤クリック時のみ呼ばれる関数なので問題ない）。
- 不合法時は**黙って無視**（占有チェックと同じ挙動。既存Go系UIの慣例に合わせる）。
  エラーバナー等は出さない。
- `submitPass` には触らない（パスは常に合法）。

## 3. テスト（受け入れ基準）

### 3-1. ユニット（`src/utils/gameLogic.test.ts` — 無ければ新規）

`isLegalMove` と `koReferenceHash` を直接テストする。全て 1-indexed 座標に注意。

1. **占有**: 石のある点 → false
2. **自殺手（隅）**: 黒(2,1),(1,2) がある盤で白(1,1) → false
3. **自殺手（グループ）**: 白2子が黒に囲まれた形の最後の内点に白 → false
4. **取りがあれば合法**: 黒(2,1),(1,2)+白(3,1),(2,2) の形で、白(1,1)が黒を取れる配置なら true
   （形は自由。capturedCount>0 で自殺手扱いにならないことを検証）
5. **コウ禁止**: コウ形（下記E2Eと同じ形でよい）で、取られた直後の即取り返し →
   koReferenceHash を渡すと false / 渡さないと true（ハッシュ比較が効いていることの対照）
6. **パスでコウ解除**: 直前手がパス（x=0,y=0）の moves 配列で koReferenceHash を計算しても、
   石を置く手が false にならないこと
7. **koReferenceHash**: moves 0件 → undefined / 1件以上 → 直前手を除いた盤面のハッシュ

### 3-2. E2E（`e2e/legality.spec.ts` 新規、生徒A=黒 vs 生徒B=白、9路）

既存ヘルパー（setupClassroomData / loginAsTeacher / createGame / playMove /
waitForMyTurn / move-count の testid）を使う。教室IDは `generateClassroomId('legality')`。

**シナリオ1: 自殺手**
1. A(黒) (2,1) → B(白) (5,5) → A (1,2)   ※3手目まで
2. B が (1,1) をクリック → **石が置かれず move-count が「3手目」のまま**
3. B が (6,6) に打てる（4手目に進む）＝対局続行可能

**シナリオ2: コウ**（座標は1-indexed、playMove(col,row)。黒=生徒A、白=生徒B）
1. 交互に8手（検算済みの正しい並び。黒1,3,5,7手目 / 白2,4,6,8手目）:
   黒(3,3) → 白(5,2) → 黒(4,2) → 白(5,4) → 黒(4,4) → 白(6,3) → 黒(5,3) → 白(4,3)
   ※8手目の白(4,3)が黒(5,3)を抜いてコウ形完成
   （白(4,3)の呼吸点=(5,3)の1つ、黒(5,3)は四方白で抜かれる）
2. 生徒A(黒) が即 (5,3) をクリック → **拒否され「8手目」のまま**（コウの即取り返し）
3. 生徒Aが (1,1) に打つ（9手目）→ 生徒Bが (9,9) に打つ（10手目）
4. 生徒Aが (5,3) に打つ → **今度は合法**（11手目、コウ立て後の取り返し。白(4,3)を抜く）
5. teardown は既存 `teardownSupabaseRoster`

### 3-3. 回帰
- `npx tsc --noEmit` / `npx eslint .`（error 0）/ `npx vitest run` 全緑
- 既存E2E全緑: multi-student-game（占有チェックの回帰アサーション入り）/ multi-user-game /
  simul-game / clock-persistence / byoyomi-voice / teacher-no-op-wiring / reconnect /
  teacher-auth / roster-supabase / security / debug-console / verify-ui
- 実行方法: `set -a; source ~/.secrets/online-go-school-teacher.env; set +a; BASE_URL=http://localhost:5175 npx playwright test <spec> --project=chromium`

## 4. ハマりどころ

- `derived.boardState` には楽観的更新・LiveKitブロードキャスト由来の手も反映されている。
  これはむしろ望ましい（自分に見えている盤面基準で判定＝二重着手も防げる）。
- コウ参照は「moves の最後の1手を除いた盤面」。`derived` からは取れないので
  `deriveBoardState(game, moves.slice(0, -1))` で都度導出する（O(手数)、クリック時のみで軽い）。
- isLegalMove の座標は 1-indexed（内部で -1 している）。playMove / data-cell も 1-indexed。
- E2Eの盤クリックは `page.getByTestId('go-board').locator('[data-cell="x-y"]')`。
  石の存在確認は `[data-stone="x-y"]`。
- 拒否の検証は「move-count が進まない」で行う（占有チェックの既存アサーションと同じ流儀）。

## 5. スコープ外

- positional superko（同型反復の全履歴チェック）は不要。簡易コウ（2手前との一致）のみ。
- サーバー側の合法手検証（設計変更になるため別議論）。
- 不合法手のUI通知（v1は黙殺で統一）。

## 6. 完了時

- commit（例: ①koReferenceHash+配線 ②unit ③E2E）→ push
- `handoff -t "自殺手・コウ判定の配線" ...` を記録し、検証役（Claude）に依頼

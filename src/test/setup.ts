import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// 単体テストは本番の Supabase に触れない。
//
// 開発機には .env があるため、モックを置き忘れたテストが getSupabase() から
// 本番プロジェクトのクライアントを作り、そのまま upsert していた
// （go_school_games に 2026-05-01 と 2026-05-25 の「たろう vs はなこ」が残っている）。
// 逆に .env の無い CI ではクライアント生成で落ち、5件が失敗していた
// （2026-09-07 Codex レビュー #6）。
//
// ここで行き先をローカルの偽アドレスに固定する。呼ばれても本番へは届かず、
// 環境変数が無くても落ちない。実際の応答が要るテストは従来どおり各自でモックする。
vi.stubEnv('VITE_DOJO_SUPABASE_URL', 'http://127.0.0.1:54321');
vi.stubEnv('VITE_DOJO_SUPABASE_KEY', 'test-anon-key-not-a-real-key');

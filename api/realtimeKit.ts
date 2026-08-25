/**
 * Cloudflare RealtimeKit の REST API を叩く部分。
 *
 * LiveKit は「部屋名を決めてトークンを署名する」だけで済んだが、RealtimeKit は
 *   1. 教室に対応する meeting を作る（UUID が振られるので教室と紐づけて覚える）
 *   2. その meeting に participant を足すと authToken が返る
 * という手順になる。参加者ごとにサーバーを1往復する。
 */
import { createClient } from '@supabase/supabase-js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

/** 先生の identity（src/utils/identityUtils.ts の TEACHER_IDENTITY と同じ値） */
export const TEACHER_IDENTITY = 'teacher';

export interface RealtimeKitConfig {
  accountId: string;
  appId: string;
  apiToken: string;
}

export function readRealtimeKitConfig(): RealtimeKitConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const appId = process.env.REALTIMEKIT_APP_ID;
  const apiToken = process.env.CLOUDFLARE_REALTIME_TOKEN;
  if (!accountId || !appId || !apiToken) return null;
  return { accountId, appId, apiToken };
}

function appUrl(cfg: RealtimeKitConfig, path: string): string {
  return `${API_BASE}/accounts/${cfg.accountId}/realtime/kit/${cfg.appId}${path}`;
}

async function callRealtimeKit<T>(
  cfg: RealtimeKitConfig,
  path: string,
  init?: { method?: string; body?: unknown; nullWhenNoSession?: boolean },
): Promise<T> {
  const res = await fetch(appUrl(cfg, path), {
    method: init?.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${cfg.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  // セッションがまだ無いとき 404、立ち上がりかけのとき 500 が返る（実測 2026-08-26）。
  // 例外にすると呼び出し側の fail-open に落ちて、先生が居なくても生徒が入れてしまう。
  if (init?.nullWhenNoSession && (res.status === 404 || res.status === 500)) return null as T;
  const json = await res.json().catch(() => ({})) as { success?: boolean; data?: T; errors?: unknown };
  if (!res.ok || json.success === false) {
    throw new Error(`RealtimeKit ${path} が失敗しました (${res.status}): ${JSON.stringify(json.errors ?? {})}`);
  }
  return json.data as T;
}

/** roomName（go-<教室ID>）から教室IDを取り出す */
export function classroomIdFromRoomName(roomName: string): string {
  return roomName.startsWith('go-') ? roomName.slice('go-'.length) : roomName;
}

/**
 * 教室に対応する meeting_id を返す。無ければ作って教室に書き戻す。
 *
 * 同時に2人が入ってきて二重に作られることがあるが、その場合も
 * どちらか片方の ID に収束すれば同じ部屋に入れる。`is null` を条件にして
 * 後から来たほうの書き込みを捨てている。
 */
export async function resolveMeetingId(
  cfg: RealtimeKitConfig,
  supabaseUrl: string,
  serviceRoleKey: string,
  roomName: string,
): Promise<string> {
  const classroomId = classroomIdFromRoomName(roomName);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: classroom, error } = await supabase
    .from('go_school_classrooms')
    .select('realtime_meeting_id')
    .eq('id', classroomId)
    .maybeSingle();

  if (error) throw new Error(`教室の読み取りに失敗しました: ${error.message}`);
  if (classroom?.realtime_meeting_id) return classroom.realtime_meeting_id;

  const created = await callRealtimeKit<{ id: string }>(cfg, '/meetings', {
    method: 'POST',
    body: { title: roomName },
  });

  const { data: saved } = await supabase
    .from('go_school_classrooms')
    .update({ realtime_meeting_id: created.id })
    .eq('id', classroomId)
    .is('realtime_meeting_id', null)
    .select('realtime_meeting_id')
    .maybeSingle();

  // 競争に負けたら、先に書かれたほうを使う（作ったばかりの meeting は捨てる）
  return saved?.realtime_meeting_id ?? created.id;
}

/**
 * 参加者を足して、そのまま接続に使える authToken を受け取る。
 *
 * custom_participant_id には LiveKit と同じ identity を入れる。
 * アプリ側は identity をキーに名簿と突き合わせているので、ここを変えると
 * 誰の映像か分からなくなる。
 *
 * 入り直すたびに記録は増えるが、その前に古い接続を切るので
 * 在室確認（まだ出ていない人が居るか）は狂わない。
 * 一度は「既存を探してトークンだけ出し直す」作りにしたが、
 * 問い合わせが2回増えて入室が遅くなるうえ、重複接続そのものは防げなかった。
 */
export async function issueParticipantToken(
  cfg: RealtimeKitConfig,
  meetingId: string,
  opts: { identity: string; username?: string; isTeacher: boolean },
): Promise<string> {
  // 古い接続を切るのは生徒だけ。先生は検討を別ウィンドウで開くとき
  // 同じ identity でもう一つ繋ぐので、切ると本体が落ちる。
  if (!opts.isTeacher) await kickStaleConnection(cfg, meetingId, opts.identity);

  const participant = await callRealtimeKit<{ token: string }>(
    cfg,
    `/meetings/${meetingId}/participants`,
    {
      method: 'POST',
      body: {
        name: opts.username ?? opts.identity,
        preset_name: opts.isTeacher ? 'group_call_host' : 'group_call_participant',
        custom_participant_id: opts.identity,
      },
    },
  );
  return participant.token;
}

/**
 * 先生が居るかどうかの直近の答え。教室ごとに数秒だけ覚えておく。
 *
 * 🔴 これが無いと、待っている生徒の人数だけ Cloudflare API を叩く。
 * 生徒19名が授業前に待機列へ並ぶと 5分あたり千回を超え、
 * **1トークン 1,200回/5分の上限**に当たる。超えるとその後5分間、
 * トークン発行を含む全ての呼び出しが 429 で止まる＝授業そのものが止まる。
 *
 * 覚える長さは「居る」と「まだ居ない」で変える。
 * - 居る: 10秒。授業中はここを全員が通るので、長めにして問い合わせを減らす。
 *   実害は「先生が抜けた直後の数秒だけ生徒が入れる」程度。
 * - まだ居ない: 3秒。長くすると、先生が入ったのに生徒が待たされる時間が伸びる。
 *   待機中の生徒が何人並んでも、外へ出ていく問い合わせは3秒に1回で足りる。
 */
const presenceCache = new Map<string, { present: boolean; at: number }>();
const PRESENT_TTL_MS = 10_000;
const ABSENT_TTL_MS = 3_000;

/**
 * 同じ人の古い接続を切ってから入れる。
 *
 * 🔴 LiveKit は同じ identity で入り直すと古い接続を自分で切ってくれるが、
 * RealtimeKit は切らずに両方つないだままにする。そのため入り直すたびに
 * 参加者一覧に同じ生徒が増え、検討の配信先も分裂した（2026-08-26 実授業）。
 * 繋ぎっぱなしの分だけ利用分数も食う。
 *
 * 切れなくても入室そのものは通す（入れないより二重のほうがまし）。
 */
async function kickStaleConnection(
  cfg: RealtimeKitConfig,
  meetingId: string,
  identity: string,
): Promise<void> {
  try {
    await callRealtimeKit(cfg, `/meetings/${meetingId}/active-session/kick`, {
      method: 'POST',
      body: { custom_participant_ids: [identity] },
      nullWhenNoSession: true,
    });
  } catch (err) {
    console.warn('[token-auth] 古い接続を切れませんでした:', err instanceof Error ? err.message : err);
  }
}

/**
 * その教室に先生が入っているか。
 *
 * 生徒だけで教室を使えないようにするための門番。繋がせてから切るのではなく
 * 最初から繋がせないので、参加者分を1分も使わない。
 *
 * active-session は人数しか返さないので、セッションIDを取ってから
 * 参加者を検索し、まだ出ていない（left_at が空）先生が居るかを見る。
 *
 * 🔴 誰も入っていない meeting の active-session は **404**、先生が入った直後の
 * 立ち上がりかけは **500** を返す。これを例外にすると呼び出し側の fail-open に
 * 落ちて、先生が居なくても生徒が入れてしまう（E2E の門番テストが落ちた 2026-08-26）。
 *
 * 🔴 先生が join してからセッションが見えるまで **約10秒** かかる（実測）。
 * その間 生徒は「先生を待っています」の画面で自動的に入り直す。
 */
export async function isTeacherInMeeting(
  cfg: RealtimeKitConfig,
  meetingId: string,
): Promise<boolean> {
  const cached = presenceCache.get(meetingId);
  if (cached) {
    const ttl = cached.present ? PRESENT_TTL_MS : ABSENT_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.present;
  }

  const present = await lookUpTeacherPresence(cfg, meetingId);
  presenceCache.set(meetingId, { present, at: Date.now() });
  return present;
}

async function lookUpTeacherPresence(
  cfg: RealtimeKitConfig,
  meetingId: string,
): Promise<boolean> {
  const session = await callRealtimeKit<{ id?: string; status?: string } | null>(
    cfg,
    `/meetings/${meetingId}/active-session`,
    { nullWhenNoSession: true },
  );
  if (!session?.id || session.status !== 'LIVE') return false;

  const result = await callRealtimeKit<{ participants?: Array<{
    custom_participant_id?: string;
    left_at?: string | null;
  }> }>(
    cfg,
    `/sessions/${session.id}/participants?search=${encodeURIComponent(TEACHER_IDENTITY)}&per_page=100`,
  );

  return (result?.participants ?? []).some(p =>
    !p.left_at &&
    (p.custom_participant_id ?? '').replace(/^sid:/, '') === TEACHER_IDENTITY,
  );
}

import { ClassroomLiveKit } from './classroomLiveKit';
import { ClassroomRealtimeKit } from './classroomRealtimeKit';
import type { ClassroomRtc } from './classroomRtc';

export type RtcProvider = 'livekit' | 'realtimekit';

/**
 * どちらの基盤で教室を開くか。
 *
 * 既定は `livekit`。RealtimeKit へ切り替えるときは `VITE_RTC_PROVIDER=realtimekit` を
 * Vercel の環境変数に入れる。問題が出たら消せば LiveKit に戻る。
 *
 * 経緯 — LiveKit Cloud の無料枠（月5,000分）は本番授業を始める前に尽き、
 * ネット道場の規模（19名・週1回）では毎月足りない見込み（2026-08-25）。
 */
export function getRtcProvider(): RtcProvider {
  const raw = (import.meta.env.VITE_RTC_PROVIDER ?? '').toLowerCase();
  return raw === 'realtimekit' ? 'realtimekit' : 'livekit';
}

export function createClassroomRtc(provider: RtcProvider = getRtcProvider()): ClassroomRtc {
  return provider === 'realtimekit' ? new ClassroomRealtimeKit() : new ClassroomLiveKit();
}

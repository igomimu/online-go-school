import { X, WifiOff, Wifi, Clock } from 'lucide-react';
import type { Student } from '../../types/classroom';
import { getDisplayName } from '../../utils/identityUtils';

/**
 * 講師に「今すぐ知らせたいこと」を出す。
 *
 * 時間切れは基本的に講師が再開する運用なので（時間切れで勝負を付けたくない
 * 2026-08-05 三村さん）、気づけないと対局が止まったままになる。音と一緒に、
 * 誰の何が起きたかと再開の導線をここに出す。
 * 置き場所はヘッダーの下（top-16）。上に重ねるとマイク・カメラのボタンを隠してしまう。
 */

export type ClassroomAlert =
  | { id: number; kind: 'disconnect'; identity: string }
  | { id: number; kind: 'rejoin'; identity: string }
  | { id: number; kind: 'timeout'; identity: string; gameId: string };

/** id を付ける前の知らせ。ユニオンのまま Omit したいので分配して剥がす */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewClassroomAlert = DistributiveOmit<ClassroomAlert, 'id'>;

interface ClassroomAlertsProps {
  alerts: ClassroomAlert[];
  students: Student[];
  onDismiss: (id: number) => void;
  onResumeGame: (gameId: string) => void;
}

export default function ClassroomAlerts({ alerts, students, onDismiss, onResumeGame }: ClassroomAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <div
      data-testid="classroom-alerts"
      className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {alerts.map(alert => {
        const name = getDisplayName(alert.identity, students);
        const isTimeout = alert.kind === 'timeout';
        const isRejoin = alert.kind === 'rejoin';
        return (
          <div
            key={alert.id}
            data-testid={`classroom-alert-${alert.kind}`}
            role="status"
            className={`pointer-events-auto rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm ${
              isRejoin
                ? 'border-line bg-surface/95'
                : 'border-alert/40 bg-surface/95'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className={`mt-0.5 shrink-0 ${isRejoin ? 'text-muted' : 'text-alert-text'}`}>
                {isTimeout ? <Clock className="h-5 w-5" strokeWidth={1.5} />
                  : isRejoin ? <Wifi className="h-5 w-5" strokeWidth={1.5} />
                    : <WifiOff className="h-5 w-5" strokeWidth={1.5} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">
                  {isTimeout ? `${name} の時間が切れました`
                    : isRejoin ? `${name} が戻りました`
                      : `${name} の接続が切れました`}
                </div>
                {isTimeout && (
                  <>
                    <p className="mt-0.5 text-xs text-muted">
                      時間切れで終わっています。再開すると時計を戻して続きから打てます。
                    </p>
                    <button
                      onClick={() => { onResumeGame(alert.gameId); onDismiss(alert.id); }}
                      className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink transition-colors duration-150 hover:bg-accent/85"
                    >
                      対局を再開する
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => onDismiss(alert.id)}
                aria-label="閉じる"
                className="shrink-0 text-muted transition-colors duration-150 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

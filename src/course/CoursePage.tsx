/**
 * 三村九段の石の形講座 — 購入と視聴（online.mimura15.jp/course/）
 * 教室の画面（App.tsx）とは別の入口。ログインは無く、購入者は「視聴リンク」（?t=…）で見る。
 * tasks/course-sales-plan.md
 */
import { useEffect, useState } from 'react';

interface Product { id: string; title: string; subtitle: string | null; price_jpy: number; minutes: number | null; available: boolean }
interface Owned { id: string; title: string; subtitle: string | null; minutes: number | null; videoUrl: string | null }

const TOKEN_KEY = 'course-access-token';

function saveToken(t: string) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 保存できなくても視聴はできる */ }
}
function loadToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `通信に失敗しました（${res.status}）`);
  return body as T;
}

export default function CoursePage() {
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState<string | null>(params.get('t'));
  const sessionId = params.get('session_id');
  const canceled = params.get('canceled');
  const [justBought, setJustBought] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [owned, setOwned] = useState<Owned[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(sessionId ? 'claim' : null);

  useEffect(() => {
    getJson<{ products: Product[] }>('/api/course-products').then(r => setProducts(r.products)).catch(e => setError(e.message));
  }, []);

  // 決済から戻ってきた → 支払いを確かめて視聴リンクの鍵を受け取る
  useEffect(() => {
    if (!sessionId) return;
    getJson<{ token: string }>(`/api/course-claim?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => {
        saveToken(r.token);
        setToken(r.token);
        setJustBought(true);
        window.history.replaceState({}, '', `/course/?t=${encodeURIComponent(r.token)}`);
      })
      .catch(e => setError(e.message))
      .finally(() => setBusy(null));
  }, [sessionId]);

  useEffect(() => {
    if (!token) return;
    saveToken(token);
    getJson<{ courses: Owned[] }>(`/api/course-access?t=${encodeURIComponent(token)}`)
      .then(r => setOwned(r.courses))
      .catch(e => setError(e.message));
  }, [token]);

  async function buy(productId: string) {
    setBusy(productId);
    setError(null);
    try {
      const r = await getJson<{ url: string }>('/api/course-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      window.location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const ownedIds = new Set((owned ?? []).map(o => o.id));
  const remembered = !token ? loadToken() : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <p className="text-sm text-gray-500">三村囲碁オンライン</p>
          <h1 className="text-xl font-semibold">三村九段の石の形講座</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        {busy === 'claim' && <p className="text-sm text-gray-600">お支払いを確認しています…</p>}
        {error && <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {canceled && !token && <p className="text-sm text-gray-600">お支払いは完了していません。購入する場合は、もう一度「購入する」を押してください。</p>}

        {justBought && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm leading-relaxed text-indigo-950">
            <p className="font-semibold">ご購入ありがとうございます。</p>
            <p>このページがあなた専用の視聴ページです。ブックマークしておいてください。同じリンクをメールでもお送りしました。</p>
          </div>
        )}

        {owned && owned.length > 0 && (
          <section className="space-y-8">
            <h2 className="text-lg font-semibold">購入した講座</h2>
            {owned.map(c => (
              <article key={c.id} className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold">{c.title}</h3>
                  {c.subtitle && <p className="text-sm text-gray-500">{c.subtitle}{c.minutes ? `（${c.minutes}分）` : ''}</p>}
                </div>
                {c.videoUrl ? (
                  <video
                    src={c.videoUrl}
                    poster={`/course-posters/${c.id}.jpg`}
                    controls
                    playsInline
                    preload="metadata"
                    controlsList="nodownload"
                    onContextMenu={e => e.preventDefault()}
                    className="w-full rounded-lg bg-black"
                  />
                ) : (
                  <p className="text-sm text-gray-600">動画を準備しています。もうしばらくお待ちください。</p>
                )}
              </article>
            ))}
          </section>
        )}

        {remembered && (
          <p className="text-sm">
            <a className="text-indigo-700 underline" href={`/course/?t=${encodeURIComponent(remembered)}`}>購入済みの講座を見る</a>
          </p>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{owned && owned.length > 0 ? 'ほかの講座' : '講座一覧'}</h2>
          <div className="space-y-3">
            {products.filter(p => !ownedIds.has(p.id)).map(p => (
              <div key={p.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h3 className="text-base font-semibold">{p.title}</h3>
                  <p className="text-sm text-gray-500">
                    {p.subtitle}{p.minutes ? `（${p.minutes}分）` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-base font-semibold">¥{p.price_jpy.toLocaleString()}</p>
                  {p.available ? (
                    <button
                      onClick={() => buy(p.id)}
                      disabled={busy !== null}
                      className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-in-out hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {busy === p.id ? '移動中…' : '購入する'}
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">準備中</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">お支払いはStripeのクレジットカード決済です。購入後すぐに視聴でき、視聴期限はありません。</p>
        </section>
      </main>
    </div>
  );
}

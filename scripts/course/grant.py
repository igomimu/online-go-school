#!/usr/bin/env python3
"""講座の視聴の権利を手で付けて、案内メールを送る（決済を通らない購入者・移行した既存の購入者用）。

使い方:
  python3 scripts/course/grant.py --product sakare --email someone@example.com --name 岩本 --kind migrate [--dry-run]

- 視聴リンクの鍵は api/_courseCore.ts と同じ作り方: base64url(HMAC-SHA256(COURSE_TOKEN_SECRET, "manual:<商品>:<メール>"))
  同じ人・同じ講座で何度実行しても同じ鍵（＝同じリンク）になり、購入は1件のまま
- 鍵と Resend は ~/.secrets/course-sales.env と resend.env、DB は ~/.secrets/supabase-dojo.env（Management API）
"""
import argparse, base64, hashlib, hmac, json, os, urllib.request

SITE = 'https://online.mimura15.jp'
REF = 'yzsyrtesydpulctjgdog'


def env(*files):
    out = {}
    for f in files:
        for line in open(os.path.expanduser(f'~/.secrets/{f}')):
            if '=' in line and not line.startswith('#'):
                k, v = line.rstrip('\n').split('=', 1)
                out[k] = v.strip().strip('"').strip("'")
    return out


def sql(query, token):
    req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}/database/query',
                                 data=json.dumps({'query': query}).encode(),
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
                                          'User-Agent': 'course-grant'})
    return json.load(urllib.request.urlopen(req))


def q(s):
    return "'" + s.replace("'", "''") + "'"


MIGRATE = """{name}さん

三村智保です。
以前ご購入いただいた石の形講座「{title}」の視聴ページを移しました。
これからは下のリンクから、いつでも何度でも見られます。
{url}

このリンクは{name}さん専用です。ブックマークしておいてください。
今までのページ（Systeme）は近いうちに閉じます。

第2回「2目の頭」もできました😃
よかったら同じページからご覧ください（こちらは別売りで3,000円です）。

見られないときは、このメールに返信してください。
よろしくお願いします。

三村智保
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--product', required=True)
    ap.add_argument('--email', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--kind', choices=['migrate'], default='migrate')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    e = env('course-sales.env', 'resend.env', 'supabase-dojo.env')
    email = a.email.strip().lower()

    seed = f'manual:{a.product}:{email}'
    token = base64.urlsafe_b64encode(hmac.new(e['COURSE_TOKEN_SECRET'].encode(), seed.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    url = f'{SITE}/course/?t={token}'
    th = hashlib.sha256(token.encode()).hexdigest()

    prod = sql(f"select title from public.course_products where id={q(a.product)}", e['SUPABASE_ACCESS_TOKEN'])
    if not prod:
        raise SystemExit(f'講座 {a.product} が無い')
    title = prod[0]['title'].split(' ', 1)[-1]   # 「第1回 裂かれ形」→「裂かれ形」
    body = MIGRATE.format(name=a.name, title=title, url=url)
    subject = f'石の形講座「{title}」視聴ページ移転のお知らせ'
    if a.dry_run:
        print(subject, '\n', body)
        return

    sql(f"""insert into public.course_purchases (product_id, email, access_token_hash, source)
            values ({q(a.product)}, {q(email)}, {q(th)}, 'manual')
            on conflict (access_token_hash) do nothing""", e['SUPABASE_ACCESS_TOKEN'])
    row = sql(f"select email_sent_at from public.course_purchases where access_token_hash={q(th)}", e['SUPABASE_ACCESS_TOKEN'])
    if row and row[0]['email_sent_at']:
        print(f'{email}: 既に送ってある（{row[0]["email_sent_at"]}）。送り直さない')
        return
    req = urllib.request.Request('https://api.resend.com/emails',
                                 data=json.dumps({'from': '三村智保 <info@mimura15.jp>', 'reply_to': 'info@mimura15.jp',
                                                  'to': [email], 'subject': subject, 'text': body}).encode(),
                                 headers={'Authorization': f'Bearer {e["RESEND_API_KEY"]}', 'Content-Type': 'application/json',
                                          'User-Agent': 'course-grant'})
    res = json.load(urllib.request.urlopen(req))
    sql(f"update public.course_purchases set email_sent_at=now() where access_token_hash={q(th)}", e['SUPABASE_ACCESS_TOKEN'])
    print(f'{email}: 送信 {res.get("id")}')


if __name__ == '__main__':
    main()

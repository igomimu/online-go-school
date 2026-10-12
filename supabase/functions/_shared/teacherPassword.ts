// 講師アカウントのパスワードハッシュ（go_school_teachers.password_hash）。
//
// 形式: pbkdf2_sha256$<回数>$<salt base64>$<hash base64>
// Web Crypto だけで書く＝Deno の Edge Function と Node の管理スクリプト
// （scripts/teacher-account.ts）の両方から同じ関数を使う。

const ITERATIONS = 100_000
const KEY_BITS = 256

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text)
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function hashTeacherPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2_sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyTeacherPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterText, saltText, hashText] = stored.split('$')
  const iterations = Number(iterText)
  if (scheme !== 'pbkdf2_sha256' || !Number.isInteger(iterations) || iterations <= 0 || !saltText || !hashText) {
    return false
  }
  const expected = fromBase64(hashText)
  const actual = await derive(password, fromBase64(saltText), iterations)
  if (actual.length !== expected.length) return false
  // 長さが同じなら全バイトを比べ切る（途中で抜けない）
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

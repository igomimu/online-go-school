import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { hashTeacherPassword, verifyTeacherPassword } from './teacherPassword.ts'

Deno.test('講師パスワード: 正しいパスワードだけ通る', async () => {
  const stored = await hashTeacherPassword('kaori-2026')
  assert(stored.startsWith('pbkdf2_sha256$100000$'))
  assertEquals(await verifyTeacherPassword('kaori-2026', stored), true)
  assertEquals(await verifyTeacherPassword('kaori-2027', stored), false)
  assertEquals(await verifyTeacherPassword('', stored), false)
})

Deno.test('講師パスワード: 同じパスワードでも毎回ちがうハッシュになる', async () => {
  const a = await hashTeacherPassword('same')
  const b = await hashTeacherPassword('same')
  assert(a !== b)
})

Deno.test('講師パスワード: 壊れた保存値は通さない', async () => {
  for (const bad of ['', 'plain', 'sha256$1$a$b', 'pbkdf2_sha256$x$a$b', 'pbkdf2_sha256$1000$$']) {
    assertEquals(await verifyTeacherPassword('x', bad), false)
  }
})

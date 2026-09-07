import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { readSessionRole } from './sessionRole.ts'

Deno.test('app_metadata の役割を読む', () => {
  const role = readSessionRole({
    app_metadata: { app_role: 'teacher', teacher_id: 'tid', classroom_id: 'c1' },
  })
  assertEquals(role.isTeacher, true)
  assertEquals(role.teacherId, 'tid')
  assertEquals(role.classroomId, 'c1')
})

// 2026-09-07 Codex レビュー #1: ここが本体。user_metadata は利用者自身が書き換えられる
Deno.test('user_metadata に teacher と書かれていても先生扱いしない', () => {
  const role = readSessionRole({
    app_metadata: { app_role: 'student', student_id: 'sid-1', classroom_id: 'c1' },
    user_metadata: { app_role: 'teacher', teacher_id: 'なりすまし' },
  })
  assertEquals(role.isTeacher, false)
  assertEquals(role.role, 'student')
  assertEquals(role.studentId, 'sid-1')
  assertEquals(role.teacherId, null)
})

Deno.test('app_metadata が空なら権限なし', () => {
  const role = readSessionRole({ user_metadata: { app_role: 'teacher' } })
  assertEquals(role.role, null)
  assertEquals(role.isTeacher, false)
  assertEquals(role.studentId, null)
})

Deno.test('知らない役割名は権限なしにする', () => {
  assertEquals(readSessionRole({ app_metadata: { app_role: 'admin' } }).role, null)
})

Deno.test('生徒セッションの teacher_id は無視する', () => {
  const role = readSessionRole({
    app_metadata: { app_role: 'student', student_id: 'sid-1', teacher_id: 'tid' },
  })
  assertEquals(role.teacherId, null)
})

Deno.test('ゲスト先生の印を読む', () => {
  assertEquals(readSessionRole({ app_metadata: { app_role: 'teacher', is_guest: true } }).isGuest, true)
  assertEquals(readSessionRole({ app_metadata: { app_role: 'teacher' } }).isGuest, false)
})

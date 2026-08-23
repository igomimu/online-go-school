import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts'
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveClassroomSelection } from './classroom_membership.ts'

const A = { id: 'CLASS-A', name: '月曜教室' }
const B = { id: 'CLASS-B', name: '土曜教室' }

describe('resolveClassroomSelection', () => {
  it('単一所属は誤ったリンクでも正しい教室へ補正する', () => {
    assertEquals(resolveClassroomSelection([A], 'wrong'), {
      selected: A,
      requiresSelection: false,
    })
  })

  it('複数所属はリンクで指定された所属教室を選ぶ', () => {
    assertEquals(resolveClassroomSelection([A, B], 'class-b'), {
      selected: B,
      requiresSelection: false,
    })
  })

  it('複数所属で指定なし・不一致なら選択を求める', () => {
    assertEquals(resolveClassroomSelection([A, B], 'wrong'), {
      selected: null,
      requiresSelection: true,
    })
  })
})

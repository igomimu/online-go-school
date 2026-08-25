import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts'
import { applyScoringConfirmation, normalizeScoringConfirmed } from './scoring_confirm.ts'

describe('整地の確定', () => {
  it('対局者が片方だけ押しても終局しない', () => {
    const first = applyScoringConfirmation([], { color: 'BLACK', isTeacher: false })
    assertEquals(first, { confirmed: ['BLACK'], finished: false })
  })

  it('黒白が揃ったら終局する', () => {
    const both = applyScoringConfirmation(['BLACK'], { color: 'WHITE', isTeacher: false })
    assertEquals(both, { confirmed: ['BLACK', 'WHITE'], finished: true })
  })

  it('同じ人が二度押しても相手の確定にはならない', () => {
    const again = applyScoringConfirmation(['BLACK'], { color: 'BLACK', isTeacher: false })
    assertEquals(again, { confirmed: ['BLACK'], finished: false })
  })

  it('講師は対局者が操作できないときの代行として単独で終局させられる', () => {
    const byTeacher = applyScoringConfirmation([], { color: null, isTeacher: true })
    assertEquals(byTeacher, { confirmed: ['BLACK', 'WHITE'], finished: true })
  })

  it('壊れた値が入っていても無視する', () => {
    assertEquals(normalizeScoringConfirmed(null), [])
    assertEquals(normalizeScoringConfirmed(['BLACK', 'BLACK', 'X', 3]), ['BLACK'])
  })
})

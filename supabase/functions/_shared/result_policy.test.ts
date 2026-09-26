import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts'
import { isStudentMutableStatus, scoringResultsAgree, studentMayFinishWith } from './result_policy.ts'

describe('生徒が書き込める結果', () => {
  it('自分の投了（相手の勝ち）は書ける', () => {
    assertEquals(studentMayFinishWith('W+R', 'BLACK'), true)
    assertEquals(studentMayFinishWith('B+R', 'WHITE'), true)
  })

  it('自分の時間切れ（相手の勝ち）は書ける', () => {
    assertEquals(studentMayFinishWith('W+T', 'BLACK'), true)
    assertEquals(studentMayFinishWith('B+T', 'WHITE'), true)
  })

  it('自分の勝ちは書けない（相手の投了・相手の時間切れ）', () => {
    assertEquals(studentMayFinishWith('B+R', 'BLACK'), false)
    assertEquals(studentMayFinishWith('W+T', 'WHITE'), false)
  })

  it('目数・持碁・取消などの結果は書けない', () => {
    assertEquals(studentMayFinishWith('W+5.5', 'BLACK'), false)
    assertEquals(studentMayFinishWith('B+0', 'WHITE'), false)
    assertEquals(studentMayFinishWith('取消', 'BLACK'), false)
    assertEquals(studentMayFinishWith('強制終局', 'BLACK'), false)
    assertEquals(studentMayFinishWith(null, 'BLACK'), false)
  })

  it('対局者でなければ何も書けない', () => {
    assertEquals(studentMayFinishWith('W+R', null), false)
  })
})

describe('生徒が操作できる対局の状態', () => {
  it('対局中と整地中だけ', () => {
    assertEquals(isStudentMutableStatus('playing'), true)
    assertEquals(isStudentMutableStatus('scoring'), true)
    assertEquals(isStudentMutableStatus('finished'), false)
    assertEquals(isStudentMutableStatus('interrupted'), false)
    assertEquals(isStudentMutableStatus(undefined), false)
  })
})

describe('整地の結果の一致', () => {
  it('同じ結果なら一致', () => {
    assertEquals(scoringResultsAgree('B+3.5', 'B+3.5'), true)
  })

  it('違う結果・控えが無いときは一致しない', () => {
    assertEquals(scoringResultsAgree('B+3.5', 'W+3.5'), false)
    assertEquals(scoringResultsAgree(null, 'B+3.5'), false)
    assertEquals(scoringResultsAgree('', ''), false)
  })
})

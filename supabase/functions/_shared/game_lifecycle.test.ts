import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts'
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  NEW_GAME_BLOCKING_STATUSES,
  shouldCloseLiveGameWhenDeletingHistory,
} from './game_lifecycle.ts'

describe('game lifecycle', () => {
  it('新規対局を止めるのは進行中・整地中だけで、中断局は止めない', () => {
    assertEquals(NEW_GAME_BLOCKING_STATUSES, ['playing', 'scoring'])
    assertEquals(NEW_GAME_BLOCKING_STATUSES.includes('interrupted' as never), false)
  })

  it('棋譜削除時は中断局だけをホームから解除する', () => {
    assertEquals(shouldCloseLiveGameWhenDeletingHistory('interrupted'), true)
    assertEquals(shouldCloseLiveGameWhenDeletingHistory('playing'), false)
    assertEquals(shouldCloseLiveGameWhenDeletingHistory('finished'), false)
  })
})

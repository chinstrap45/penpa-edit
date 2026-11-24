import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { AKARI_SOLVE, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('a solve link', () => {
  let opened
  before(async () => { opened = await openPenpa(browser(), AKARI_SOLVE) })
  after(async () => { await opened?.context.close() })

  it('opens in solve mode with its clues and no error', async () => {
    const { page } = opened
    const expected = { mode: 'solve', clues: 13 }
    const read = () => page.evaluate(() => ({ mode: pu.mmode, clues: Object.keys(pu.pu_q.number).length }))
    assert.deepEqual(await settle(read, expected), expected)
  })
})

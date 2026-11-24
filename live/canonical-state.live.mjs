import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { canonicalState, readEngineState, REPLAY_TIMESTAMP } from './canonical-state.mjs'
import { ANSWER_CELL, GIVEN_CELL, makeNumberSolveLink, openPenpa, typeDigitInPage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const OTHER_CELL = 2
const LATE_SECONDS = 30

async function openSolve (query) {
  const opened = await openPenpa(browser(), query)
  const givens = await settle(() => opened.page.evaluate(() => Object.keys(pu.pu_q.number).length), 1)
  assert.equal(givens, 1, 'the given has loaded')
  return opened
}

const read = (page) => page.evaluate(readEngineState).then(canonicalState)
const lineOf = (key) => (state) => state.split('\n').find((l) => l.startsWith(`${key} = `))

describe('canonical state on a live page', () => {
  let query
  before(async () => { query = await makeNumberSolveLink(browser()) })

  it('is byte-identical for two loads of one link with the same digit typed at different timer readings', async (t) => {
    const first = await openSolve(query)
    const second = await openSolve(query)
    t.after(() => first.context.close())
    t.after(() => second.context.close())
    assert.equal(await read(second.page), await read(first.page), 'the same right after loading')
    await second.page.evaluate((seconds) => {
      sw_timer.stop()
      sw_timer.start({ precision: 'secondTenths', startValues: { seconds } })
    }, LATE_SECONDS)
    const stamps = []
    for (const { page } of [first, second]) {
      await page.evaluate(typeDigitInPage, { index: OTHER_CELL, digit: '3' })
      stamps.push(await page.evaluate((at) => pu.pu_a.command_replay.__a[0][at], REPLAY_TIMESTAMP))
    }
    assert.notEqual(stamps[0], stamps[1], 'the replay timestamps differ (the premise)')
    assert.equal(await read(second.page), await read(first.page))
  })

  // A solve link carries no genre tags, so the page is tagged here for its conflict check to run.
  it('writes the answer, mode, selection, conflicts and verdict the page holds', async (t) => {
    const { context, page } = await openSolve(query)
    t.after(() => context.close())
    await page.evaluate(() => { pu.user_tags = ['classic'] })
    await page.evaluate(typeDigitInPage, { index: OTHER_CELL, digit: '1' })
    const [given, typed] = await page.evaluate((cells) => cells.map((i) => pu.centerlist[i]), [GIVEN_CELL, OTHER_CELL])
    const lines = (await read(page)).split('\n')
    const expected = [
      `pu_a.number.${typed} = ["1",2,"1"]`,
      'pu_a_col.command_undo.length = 1',
      'mode.qa = "pu_a"',
      'mode.edit_mode = "number"',
      'mode.submode = "1"',
      'mode.style = 2',
      'mode.orientation = "R"',
      `selection = [${typed}]`,
      `conflict_cells = [${given},${typed}]`,
      'sol_flag = 0'
    ]
    assert.deepEqual(expected.filter((l) => !lines.includes(l)), [], 'every expected line is written')
  })

  it('changes only the moved digit\'s line when a digit moves to another cell', async (t) => {
    const { context, page } = await openSolve(query)
    t.after(() => context.close())
    const cells = await page.evaluate(([from, to]) => [pu.centerlist[from], pu.centerlist[to]], [ANSWER_CELL, OTHER_CELL])
    await page.evaluate((from) => { pu.pu_a.number[from] = ['3', 2, '1'] }, cells[0])
    const was = (await read(page)).split('\n')
    await page.evaluate(([from, to]) => {
      pu.pu_a.number[to] = pu.pu_a.number[from]
      delete pu.pu_a.number[from]
    }, cells)
    const now = (await read(page)).split('\n')
    assert.deepEqual({
      gone: was.filter((l) => !now.includes(l)),
      added: now.filter((l) => !was.includes(l))
    }, {
      gone: [`pu_a.number.${cells[0]} = ["3",2,"1"]`],
      added: [`pu_a.number.${cells[1]} = ["3",2,"1"]`]
    })
  })

  // A duplicate link carries no selection (`maketext_duplicate` writes none), so the copy opens with none: today's
  // engine behaviour, pinned here.
  it('reopens a solved board from its duplicate link to the same state but the selection', async (t) => {
    const source = await openSolve(query)
    t.after(() => source.context.close())
    await source.page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '2' })
    const solved = await settle(() => read(source.page).then(lineOf('sol_flag')), 'sol_flag = 1')
    assert.equal(solved, 'sol_flag = 1', 'the board is solved (the premise)')
    const state = await read(source.page)
    assert.match(state, /^selection = \[\d+\]$/m, 'a cell is selected (the premise)')
    const link = await source.page.evaluate(() => {
      savetext_clone()
      return document.getElementById('savetextarea').value
    })
    const copy = await openPenpa(browser(), link.slice(link.indexOf('#')))
    t.after(() => copy.context.close())
    const expected = state.replace(/^selection = .*$/m, 'selection = []')
    assert.equal(await settle(() => read(copy.page), expected), expected)
  })
})

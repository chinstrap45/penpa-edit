import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { ANSWER_CELL, makeNumberSolveLink, openSolvePage, setTool, typedDigits, useBrowser, waitForTool } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// How long a "the clock held" check watches a stopped clock; a held clock cannot be waited for, only watched.
const HOLD_WATCH_MS = 1500
const FREE_CELL = 12

async function openSolve () {
  const opened = await openSolvePage(browser(), await makeNumberSolveLink(browser()))
  await setTool(opened.page, { mode: 'number', submode: '1' })
  return opened
}

const timer = (page) => page.evaluate(() => engine.getTimer())
const clockText = (page) => page.getByRole('timer').textContent()
const button = (page, name) => page.getByRole('button', { name, exact: true })
const cardIsInert = (page, card) => page.getByRole('region', { name: card }).evaluate((node) => node.querySelector('.ui-body').closest('[inert]') !== null)
const solvedDialog = (page) => page.getByRole('dialog', { name: 'Puzzle solved' })
const swalCount = (page) => page.locator('.swal2-container').count()

const countSolvedDialogs = (page) => page.evaluate(() => {
  window.solvedDialogsShown = 0
  document.addEventListener('wa-show', (e) => {
    if (e.target.matches('wa-dialog') && e.target.getAttribute('label') === 'Puzzle solved') window.solvedDialogsShown++
  })
})
const solvedDialogsShown = (page) => page.evaluate(() => window.solvedDialogsShown)

async function enterAnswer (page) {
  await clickCell(page, ANSWER_CELL)
  await page.keyboard.press('2')
}

async function solve (page) {
  await enterAnswer(page)
  await solvedDialog(page).waitFor()
  await button(page, 'Close').first().click()
  await solvedDialog(page).waitFor({ state: 'hidden' })
  assert.equal(await settle(async () => (await timer(page)).paused, true), true, 'the solve stopped the clock')
  return timer(page)
}

describe('the solved message', () => {
  it('is the desk\'s own dialog, with no SweetAlert2 popup', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await enterAnswer(page)
    await solvedDialog(page).waitFor()
    assert.notEqual((await page.locator('.ui-solved-message').textContent()).trim(), '', 'the dialog says something')
    assert.equal(await swalCount(page), 0, 'no Swal element')
    await button(page, 'Close').first().click()
    await solvedDialog(page).waitFor({ state: 'hidden' })
    assert.equal(await swalCount(page), 0, 'and none after it closes')
  })

  it('shows once: an undo and a redo back into the solved state show nothing more, and the clock stays stopped', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await countSolvedDialogs(page)
    const stopped = await solve(page)
    await button(page, 'Undo').click()
    assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the undo took the answer out')
    await button(page, 'Redo').click()
    assert.deepEqual(await settle(() => typedDigits(page), ['2']), ['2'], 'the redo put it back')
    await sleep(HOLD_WATCH_MS)
    assert.equal(await solvedDialog(page).isVisible(), false, 'no second dialog')
    assert.equal(await solvedDialogsShown(page), 1, 'one dialog in total')
    assert.deepEqual(await timer(page), stopped, 'the clock never moved')
  })

  it('shows the timer as solved once the message is closed', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    assert.doesNotMatch(await clockText(page), /✓/, 'a running clock has no check mark')
    await solve(page)
    assert.match(await clockText(page), /✓/, 'the solved clock has one')
  })
})

describe('the clock after a solve', () => {
  it('cannot be paused: Pause is disabled and a forced press covers nothing', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    const stopped = await solve(page)
    assert.equal(await settle(() => button(page, 'Pause').isDisabled(), true), true, 'Pause is disabled')
    await button(page, 'Pause').click({ force: true })
    assert.equal(await page.evaluate(() => { engine.pauseTimer(); return engine.getTimer().covered }), false, 'engine.pauseTimer covers nothing either')
    await sleep(HOLD_WATCH_MS)
    assert.equal(await page.getByRole('region', { name: 'Paused' }).isVisible(), false, 'no cover')
    assert.deepEqual(await timer(page), stopped, 'the clock did not run')
  })

  it('stays stopped through F4, which resumes a stopped clock and so does nothing', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    const stopped = await solve(page)
    await page.keyboard.press('F4')
    await page.keyboard.press('F4')
    await sleep(HOLD_WATCH_MS)
    assert.deepEqual(await timer(page), stopped)
    assert.equal(await page.getByRole('region', { name: 'Paused' }).isVisible(), false)
  })

  it('runs again after Restart', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await solve(page)
    await button(page, 'Restart').click()
    await button(page, 'Restart puzzle').click()
    assert.equal(await settle(async () => (await timer(page)).paused, false), false, 'the restart started the clock')
    assert.equal(await button(page, 'Pause').isDisabled(), false, 'and Pause works again')
    assert.doesNotMatch(await clockText(page), /✓/)
  })
})

describe('a solved puzzle reloaded', () => {
  it('opens with the board visible, the clock stopped at its solve time and no popup', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await page.waitForFunction(() => engine.getTimer().seconds >= 1)
    const stopped = await solve(page)
    assert.equal(await page.evaluate(() => engine.saveProgress()), true, 'the progress is saved')
    await page.reload()
    await page.getByRole('region', { name: 'Board' }).waitFor()
    await page.evaluate(() => engine.ready)
    await sleep(HOLD_WATCH_MS)
    assert.equal(await swalCount(page), 0, 'no Swal element')
    assert.equal(await solvedDialog(page).isVisible(), false, 'no dialog')
    const after = await timer(page)
    assert.equal(after.paused, true, 'the clock is stopped')
    assert.equal(after.covered, false, 'the board is not covered')
    assert.equal(await page.getByRole('region', { name: 'Paused' }).isVisible(), false, 'no pause cover')
    assert.equal(Math.floor(after.seconds), Math.floor(stopped.seconds), 'at its solve time')
    assert.match(await clockText(page), /✓/, 'and looks solved')
    await sleep(HOLD_WATCH_MS)
    assert.deepEqual(await timer(page), after, 'it holds')
  })
})

describe('a solved puzzle that was undone and reloaded', () => {
  it('keeps the clock stopped and shows no dialog when it is solved again', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await page.waitForFunction(() => engine.getTimer().seconds >= 1)
    const stopped = await solve(page)
    await button(page, 'Undo').click()
    assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the undo took the answer out')
    // Penpa+ saves on unload without waiting for the write, so the reload would race it.
    assert.equal(await page.evaluate(() => engine.saveProgress()), true, 'the progress is saved')
    await page.reload()
    await page.getByRole('region', { name: 'Board' }).waitFor()
    await page.evaluate(() => engine.ready)
    await countSolvedDialogs(page)
    const after = await timer(page)
    assert.equal(after.paused, true, 'the clock is stopped')
    assert.equal(Math.floor(after.seconds), Math.floor(stopped.seconds), 'at the first solve time')
    await setTool(page, { mode: 'number', submode: '1' })
    await waitForTool(page, { mode: 'number', submode: '1' })
    await enterAnswer(page)
    assert.deepEqual(await settle(() => typedDigits(page), ['2']), ['2'], 'solved again')
    await sleep(HOLD_WATCH_MS)
    assert.equal(await solvedDialogsShown(page), 0, 'no dialog')
    assert.deepEqual(await timer(page), after, 'the clock held')
  })
})

describe('a shared link to a solved board', () => {
  it('opens in a fresh browser with the board uncovered, the clock stopped, no popup and the timer solved', async (t) => {
    const solver = await openSolve()
    t.after(() => solver.context.close())
    await solve(solver.page)
    // The link Penpa+'s Clone button writes: the board as entered, marked `l=solvedup`.
    const link = await solver.page.evaluate(() => { const url = pu.maketext_duplicate(); return url.slice(url.indexOf('#')) + '&l=solvedup' })
    const { context, page } = await openSolvePage(browser(), link)
    t.after(() => context.close())
    await sleep(HOLD_WATCH_MS)
    const after = await timer(page)
    assert.equal(after.paused, true, 'the clock is stopped')
    assert.equal(after.covered, false, 'the board is not covered')
    assert.equal(await swalCount(page), 0, 'no Swal element')
    assert.equal(await solvedDialog(page).isVisible(), false, 'no dialog')
    assert.match(await clockText(page), /✓/, 'the timer looks solved')
    await sleep(HOLD_WATCH_MS)
    assert.deepEqual(await timer(page), after, 'the clock holds')
  })
})

describe('a paused board', () => {
  it('disables Restart, the pins, Mode and Recent; the cover\'s Resume button resumes', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await clickCell(page, FREE_CELL)
    await button(page, 'Pause').click()
    const cover = page.getByRole('region', { name: 'Paused' })
    await cover.waitFor()
    assert.equal(await settle(() => button(page, 'Restart').isDisabled(), true), true, 'Restart is disabled')
    for (const card of ['Pinned', 'Mode', 'Recent']) {
      assert.equal(await cardIsInert(page, card), true, `${card} is disabled`)
    }
    assert.equal(await button(page, 'Penpa+').isDisabled(), false, 'Penpa+ works')
    await cover.getByRole('button', { name: 'Resume' }).click()
    await cover.waitFor({ state: 'hidden' })
    assert.equal((await timer(page)).paused, false, 'the clock runs')
    assert.equal(await button(page, 'Restart').isDisabled(), false, 'Restart works again')
    assert.equal(await cardIsInert(page, 'Mode'), false, 'and so does Mode')
  })
})

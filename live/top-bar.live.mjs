import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { afterChange, makeNumberSolveLink, openSolvePage, SAME_ROW_CELL, setTool, typedDigits, useBrowser, waitForDesk } from './page.mjs'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const CELL = 12

// How long a "the timer held" check watches a paused timer; a held clock cannot be waited for, only watched.
const HOLD_WATCH_MS = 1500

async function openSolve (options) {
  const opened = await openSolvePage(browser(), await makeNumberSolveLink(browser()), options)
  await setTool(opened.page, { mode: 'number', submode: '1' })
  return opened
}

const canUndo = (page) => page.evaluate(() => engine.getState().canUndo)
const canRedo = (page) => page.evaluate(() => engine.getState().canRedo)
const timer = (page) => page.evaluate(() => engine.getTimer())

const button = (page, name) => page.getByRole('button', { name, exact: true })
const timerText = (page) => page.getByRole('timer').textContent()
const boardCard = (page) => page.getByRole('region', { name: 'Board' })
// The drawn board alone, not the card's title bar, whose buttons show the pointer's hover. Without animations, so the
// tool-name flash that follows a tool change is not in the picture.
const boardPicture = (page) => boardCard(page).locator('canvas:visible').screenshot({ animations: 'disabled' })

async function assertDisabled (page, name, expected, message) {
  assert.equal(await settle(() => button(page, name).isDisabled(), expected), expected, message)
}

async function enterDigit (page, digit = '1', cell = CELL) {
  const before = await typedDigits(page)
  await clickCell(page, cell)
  await page.keyboard.press(digit)
  const expected = [...before, digit]
  assert.deepEqual(await settle(() => typedDigits(page), expected), expected, 'the digit is on the board')
}

const paused = (page) => page.getByRole('region', { name: 'Paused' })

describe('undo and redo', () => {
  it('Undo is disabled on a fresh puzzle, enabled after an entry, and Undo and Redo change the board', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await assertDisabled(page, 'Undo', true, 'undo on a fresh puzzle')
    await assertDisabled(page, 'Redo', true, 'redo on a fresh puzzle')
    await enterDigit(page)
    await assertDisabled(page, 'Undo', false, 'undo after an entry')

    await button(page, 'Undo').click()
    assert.deepEqual(await settle(() => typedDigits(page), []), [], 'undo removes the entry')
    assert.equal(await settle(() => canUndo(page), false), false)
    assert.equal(await settle(() => canRedo(page), true), true)
    await assertDisabled(page, 'Redo', false, 'redo after an undo')

    await button(page, 'Redo').click()
    assert.deepEqual(await settle(() => typedDigits(page), ['1']), ['1'], 'redo brings the entry back')
    assert.equal(await settle(() => canRedo(page), false), false)
  })
})

describe('Restart', () => {
  it('after confirming keeps the givens, clears the entries, disables undo and resets the timer', async (t) => {
    const fresh = await openSolve()
    const freshBoard = await boardPicture(fresh.page)
    await fresh.context.close()
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await enterDigit(page)
    await page.waitForFunction(() => engine.getTimer().seconds >= 1)
    await button(page, 'Restart').click()
    await button(page, 'Restart puzzle').click()

    assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the entries are gone')
    assert.equal(await settle(() => canUndo(page), false), false, 'the undo history is gone')
    await assertDisabled(page, 'Undo', true, 'and the button says so')
    const { seconds, paused } = await timer(page)
    assert.equal(seconds < 1, true, `the timer restarted from zero, got ${seconds}`)
    assert.equal(paused, false, 'and runs')
    assert.deepEqual(await boardPicture(page), freshBoard, 'the board looks as a fresh one: the givens stayed')
  })

  it('after cancelling changes nothing', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await enterDigit(page)
    await page.waitForFunction(() => engine.getTimer().seconds >= 1)
    await button(page, 'Restart').click()
    const dialog = page.getByRole('dialog', { name: 'Restart the puzzle?' })
    await button(page, 'Cancel').click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(await typedDigits(page), ['1'])
    assert.equal(await canUndo(page), true)
    const { seconds, paused } = await timer(page)
    assert.equal(seconds >= 1, true, `the timer was not reset, got ${seconds}`)
    assert.equal(paused, false, 'and runs')
  })
})

describe('Pause', () => {
  it('covers the board; a click and a digit change nothing; F4 resumes', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await clickCell(page, CELL)
    assert.equal(await page.evaluate(() => readEngineState().selection.length), 1)
    await button(page, 'Pause').click()
    const covered = page.getByRole('region', { name: 'Paused' })
    await covered.waitFor()
    assert.equal((await timer(page)).paused, true)

    await page.keyboard.press('1')
    await clickCell(page, CELL + 1)
    assert.deepEqual(await typedDigits(page), [], 'nothing was entered')
    assert.equal(await page.evaluate(() => readEngineState().selection.length), 1, 'and the click moved no selection')

    await page.keyboard.press('F4')
    await covered.waitFor({ state: 'hidden' })
    assert.equal((await timer(page)).paused, false)
    await page.keyboard.press('1')
    assert.deepEqual(await settle(() => typedDigits(page), ['1']), ['1'], 'after F4 the board takes the digit')
  })

  it('F4 resumes with the focus in a text field', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await button(page, 'Pause').click()
    await paused(page).waitFor()
    await page.getByRole('combobox', { name: 'Tool' }).focus()
    await page.keyboard.press('F4')
    assert.equal(await settle(async () => (await timer(page)).paused, false), false, 'F4 resumed the clock')
    await paused(page).waitFor({ state: 'hidden' })
  })

  it('disables Undo and Redo, so neither changes the board, until it resumes', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await enterDigit(page, '1', CELL)
    await enterDigit(page, '2', CELL + 1)
    await button(page, 'Undo').click()
    assert.deepEqual(await settle(() => typedDigits(page), ['1']), ['1'], 'one entry to undo and one to redo')
    await assertDisabled(page, 'Redo', false, 'redo before the pause')
    await button(page, 'Pause').click()
    await paused(page).waitFor()
    await assertDisabled(page, 'Undo', true, 'undo while paused')
    await assertDisabled(page, 'Redo', true, 'redo while paused')
    await button(page, 'Undo').click({ force: true })
    await button(page, 'Redo').click({ force: true })
    assert.deepEqual(await typedDigits(page), ['1'], 'the board did not change')
    await button(page, 'Resume').first().click()
    await assertDisabled(page, 'Undo', false, 'undo after resuming')
    await assertDisabled(page, 'Redo', false, 'redo after resuming')
  })

  it('the pause button resumes too', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await button(page, 'Pause').click()
    await page.getByRole('region', { name: 'Paused' }).waitFor()
    await button(page, 'Resume').first().click()
    await page.getByRole('region', { name: 'Paused' }).waitFor({ state: 'hidden' })
    assert.equal((await timer(page)).paused, false)
  })
})

describe('the timer', () => {
  it('advances while running and holds while paused', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    assert.notEqual(await settle(() => timerText(page), '00:01'), '00:00', 'the shown time advanced')
    assert.equal((await timer(page)).seconds >= 1, true, 'and so did the engine\'s')

    await button(page, 'Pause').click()
    await page.getByRole('region', { name: 'Paused' }).waitFor()
    const held = await timer(page)
    const heldText = await timerText(page)
    await sleep(HOLD_WATCH_MS)
    assert.deepEqual(await timer(page), held)
    assert.equal(await timerText(page), heldText)
  })
})

describe('light and dark', () => {
  it('applies the theme to the page, with no theme button in the bar', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    const desk = page.locator('.ui-desk')
    const ground = () => desk.evaluate((node) => getComputedStyle(node).backgroundColor)
    const light = await ground()
    assert.equal(await page.locator('.ui-bar').getByRole('button', { name: /theme/i }).count(), 0)

    await page.evaluate(() => engine.setTheme('dark'))
    assert.equal(await settle(async () => (await ground()) !== light, true), true, 'the page changed')

    await page.evaluate(() => engine.setTheme('light'))
    assert.equal(await settle(ground, light), light, 'and back')
  })
})

describe('trial mode', () => {
  const trialShown = async (page) => {
    const label = page.getByText(/^Trial \d+$/)
    return (await label.isVisible()) ? label.textContent() : null
  }
  const expectTrial = async (page, expected, message) => {
    assert.equal(await settle(() => trialShown(page), expected), expected, message)
  }
  const press = async (page, name) => {
    await button(page, name).click()
    await afterChange(page)
  }
  const expectDigits = async (page, expected, message) => {
    assert.deepEqual(await settle(() => typedDigits(page), expected), expected, message)
  }

  it('Discard takes the board back to before Try, and redo brings the discarded entries back', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await expectTrial(page, null, 'no trial on a fresh puzzle')
    await enterDigit(page, '1', CELL)
    await press(page, 'Try')
    await expectTrial(page, 'Trial 1', 'Try starts a trial')
    await enterDigit(page, '2', CELL + 1)
    await enterDigit(page, '3', CELL + 2)
    await press(page, 'Discard')
    await expectDigits(page, ['1'], 'the board is as it was before Try')
    await expectTrial(page, null, 'and the trial is over')
    await press(page, 'Redo')
    await press(page, 'Redo')
    await expectDigits(page, ['1', '2', '3'], 'redo brings both entries back')
  })

  it('Discard in a nested trial removes only its own entry, and Keep then ends the outer one', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await press(page, 'Try')
    for (const name of ['Keep all', 'Discard all']) {
      assert.equal(await button(page, name).isVisible(), false, `${name} is hidden with one trial on`)
    }
    await enterDigit(page, '1', CELL)
    await press(page, 'Try')
    await expectTrial(page, 'Trial 2', 'a Try inside a trial nests')
    for (const name of ['Keep all', 'Discard all']) {
      assert.equal(await button(page, name).isVisible(), true, `${name} shows with two trials on`)
    }
    await enterDigit(page, '2', CELL + 1)
    await press(page, 'Discard')
    await expectDigits(page, ['1'], 'only the inner entry is gone')
    await expectTrial(page, 'Trial 1', 'the outer trial is still on')
    await press(page, 'Keep')
    await expectDigits(page, ['1'], 'Keep leaves the entry')
    await expectTrial(page, null, 'and no trial is shown')
  })

  it('Discard all from depth 2 returns to the board before the first Try; Keep all keeps every entry', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await enterDigit(page, '1', CELL)
    await press(page, 'Try')
    await enterDigit(page, '2', CELL + 1)
    await press(page, 'Try')
    await enterDigit(page, '3', CELL + 2)
    await press(page, 'Discard all')
    await expectDigits(page, ['1'], 'every trial entry is gone')
    await expectTrial(page, null, 'and every trial is over')

    await press(page, 'Try')
    await enterDigit(page, '2', CELL + 1)
    await press(page, 'Try')
    await enterDigit(page, '3', CELL + 2)
    await press(page, 'Keep all')
    await expectDigits(page, ['1', '2', '3'], 'Keep all leaves every entry')
    await expectTrial(page, null, 'and ends every trial')
  })

  it('an undo by hand past a stage\'s start ends that stage', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await press(page, 'Try')
    await enterDigit(page, '1', CELL)
    await press(page, 'Try')
    await enterDigit(page, '2', CELL + 1)
    await press(page, 'Undo')
    await expectTrial(page, 'Trial 2', 'an undo back to the stage\'s start keeps it')
    await press(page, 'Undo')
    await expectTrial(page, 'Trial 1', 'an undo past it ends it')
  })

  it('turns every trial button off while the board is paused', async (t) => {
    const { context, page } = await openSolve()
    const names = ['Try', 'Keep', 'Discard', 'Keep all', 'Discard all']
    t.after(() => context.close())
    await press(page, 'Try')
    await enterDigit(page, '1', CELL)
    await press(page, 'Try')
    await button(page, 'Pause').click()
    for (const name of names) await assertDisabled(page, name, true, `${name} while paused`)
    await button(page, 'Resume').first().click()
    for (const name of names) await assertDisabled(page, name, false, `${name} after Resume`)
  })

  it('Restart ends every stage', async (t) => {
    const { context, page } = await openSolve()
    t.after(() => context.close())
    await press(page, 'Try')
    await enterDigit(page, '1', CELL)
    await press(page, 'Try')
    await expectTrial(page, 'Trial 2', 'two trials are on (the premise)')
    await button(page, 'Restart').click()
    await button(page, 'Restart puzzle').click()
    await expectDigits(page, [], 'the restart cleared the board (the premise)')
    await expectTrial(page, null, 'no trial is left')
  })

  // A solve link carries no genre tags, so the page is tagged here for its sudoku conflict check to run.
  it('keeps the timer running, and the conflict marks and saved progress follow a Discard', async (t) => {
    const { context, page } = await openSolve({ served: true })
    t.after(() => context.close())
    await page.evaluate(() => { pu.user_tags = ['classic'] })
    const conflicts = async () => canonicalState(await page.evaluate(readEngineState)).split('\n').filter((l) => l.startsWith('conflict_cells'))
    const expectRunning = async (step) => {
      const before = (await timer(page)).seconds
      await page.waitForFunction((s) => engine.getTimer().seconds > s, before)
      assert.equal((await timer(page)).paused, false, `the timer runs after ${step}`)
    }
    await enterDigit(page, '3', CELL)
    const conflictsBefore = await conflicts()
    await press(page, 'Try')
    await expectRunning('Try')
    // The given 1 shares row 0 with this cell.
    await clickCell(page, SAME_ROW_CELL)
    await page.keyboard.press('1')
    await expectDigits(page, ['1', '3'], 'the trial entry is on the board')
    assert.notDeepEqual(await conflicts(), conflictsBefore, 'the trial entry is a conflict (the premise)')
    await press(page, 'Try')
    await press(page, 'Keep')
    await expectRunning('Keep')
    await press(page, 'Discard')
    await expectRunning('Discard')
    await expectDigits(page, ['3'], 'the conflicting entry is gone')
    assert.deepEqual(await conflicts(), conflictsBefore, 'and so are its conflict marks')

    assert.equal(await page.evaluate(() => engine.saveProgress()), true, 'the progress is saved (the premise)')
    await page.reload()
    await waitForDesk(page)
    await expectDigits(page, ['3'], 'the saved progress holds the board after the Discard')
    await expectTrial(page, null, 'a reload keeps the entries and drops the stages')
  })
})

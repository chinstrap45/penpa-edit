import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANSWER_CELL, boardAgainstCard, cardBodyButtons, chipName, DIGIT_CELL, linkFromNewBoard, makeNumberSolveLink, newBoardSolveLink, openSolvePage, setTool, typedDigits, typeDigitInPage, useBrowser, openSettings, waitForDesk, cellSize } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const BOARD = 'section[aria-label="Board"]'
const DIALOG = 'Change size'
const START = { columns: 4, rows: 4, given: [0, 0] }

// Penpa+ draws the cells `i + j * nx0` with i and j from 2 to nx0 - 3 and ny0 - 3; the rest of `pu.point` is outside the board.
function layoutInPage () {
  const cells = []
  for (let j = 2; j < pu.ny0 - 2; j++) for (let i = 2; i < pu.nx0 - 2; i++) cells.push(pu.point[i + j * pu.nx0])
  // To the hundredth of a pixel: a turned board puts centres at half pixels, give or take a float's error.
  const at = (v) => Math.round(v * 100) / 100
  const xs = [...new Set(cells.map((p) => at(p.x)))].sort((a, b) => a - b)
  const ys = [...new Set(cells.map((p) => at(p.y)))].sort((a, b) => a - b)
  const givenAt = Object.keys(pu.pu_q.number)[0]
  const given = givenAt === undefined ? null : [xs.indexOf(at(pu.point[givenAt].x)), ys.indexOf(at(pu.point[givenAt].y))]
  return { columns: xs.length, rows: ys.length, given, givens: Object.keys(pu.pu_q.number).length, entries: Object.keys(pu.pu_a.number).length }
}
const layout = (page) => page.evaluate(layoutInPage)
const shape = async (page) => {
  const { columns, rows, given } = await layout(page)
  return { columns, rows, given }
}

function refusalInPage ([side, change]) {
  try {
    engine.changeSize(side, change)
    return 'no throw'
  } catch (e) {
    return e.message
  }
}
const refusal = (page, side, change) => page.evaluate(refusalInPage, [side, change])

const openNumberBoard = async (options) => {
  return openSolvePage(browser(), await makeNumberSolveLink(browser()), options)
}

function boardLinkInPage ({ columns, rows, gridtype = 'square', space = 0, topClues = 0, topLine = null, turn = 0, flip = null }) {
  document.getElementById('gridtype').value = gridtype
  UserSettings.gridtype = gridtype
  document.getElementById('nb_size1').value = columns
  document.getElementById('nb_size2').value = rows
  for (const side of [1, 2, 3, 4]) document.getElementById(`nb_space${side}`).value = space
  create_newboard()
  pu.pu_q.number[pu.centerlist[0]] = [1, 1, '1']
  // Penpa+'s cells are `i + j * nx0`, the board's first row at j = 2 and its first column at i = 2.
  for (let k = 0; k < topClues; k++) pu.pu_q.number[2 + k + 2 * pu.nx0] = [String(k + 1), 1, '1']
  const [second, third] = [3 + 2 * pu.nx0, 4 + 2 * pu.nx0]
  if (topLine === 'thermo') pu.pu_q.thermo.push([second, third])
  if (topLine === 'line') pu.pu_q.line[`${second},${third}`] = 3
  if (turn) pu.rotate_grid(turn)
  if (flip) pu[`rotate_${flip}`]()
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}
const boardLink = (options) => linkFromNewBoard(browser(), boardLinkInPage, options)

describe('engine.changeSize on a square-cell board', () => {
  it('adds a blank row or column on the side it names, and removes it again', async (t) => {
    const { context, page, errors } = await openNumberBoard()
    t.after(() => context.close())
    assert.deepEqual(await shape(page), START)
    const steps = [
      ['top', 1, { columns: 4, rows: 5, given: [0, 1] }],
      ['left', 1, { columns: 5, rows: 5, given: [1, 1] }],
      ['bottom', 1, { columns: 5, rows: 6, given: [1, 1] }],
      ['right', 1, { columns: 6, rows: 6, given: [1, 1] }],
      ['top', -1, { columns: 6, rows: 5, given: [1, 0] }],
      ['left', -1, { columns: 5, rows: 5, given: [0, 0] }],
      ['bottom', -1, { columns: 5, rows: 4, given: [0, 0] }],
      ['right', -1, START]
    ]
    for (const [side, change, want] of steps) {
      await page.evaluate(([s, c]) => engine.changeSize(s, c), [side, change])
      assert.deepEqual(await shape(page), want, `after ${side} ${change}`)
      assert.equal((await layout(page)).givens, 1, `the given stays after ${side} ${change}`)
    }
    assert.deepEqual(errors, [])
  })

  it('throws on a side or change it does not know', async (t) => {
    const { context, page } = await openNumberBoard()
    t.after(() => context.close())
    assert.match(await refusal(page, 'up', 1), /no side "up"/)
    assert.match(await refusal(page, 'top', 2), /change must be 1 or -1, got 2/)
    assert.deepEqual(await shape(page), START)
  })

  it('reports the board\'s size, and what each side allows, in getSizeChanges', async (t) => {
    const { context, page } = await openNumberBoard()
    t.after(() => context.close())
    await page.evaluate(() => engine.changeSize('top', 1))
    const changes = await page.evaluate(() => engine.getSizeChanges())
    assert.equal(changes.unavailable, null)
    assert.deepEqual([changes.columns, changes.rows], [4, 5])
    assert.deepEqual(Object.keys(changes.sides).sort(), ['bottom', 'left', 'right', 'top'])
    for (const side of ['top', 'bottom', 'left', 'right']) assert.equal(changes.sides[side].add, null, `${side} can add`)
    assert.equal(changes.sides.top.remove, null, 'the blank top row can go')
    for (const side of ['bottom', 'left', 'right']) assert.match(changes.sides[side].remove, /part of the grid/, `${side} cannot remove`)
  })

  it('refuses to remove a row or column of the grid itself, and changes nothing', async (t) => {
    const { context, page } = await openNumberBoard()
    t.after(() => context.close())
    for (const side of ['top', 'bottom', 'left', 'right']) {
      assert.match(await refusal(page, side, -1), /part of the grid/, side)
      assert.deepEqual(await shape(page), START, `nothing changed on ${side}`)
    }
  })

  it('refuses to remove a blank row that holds a given, and removes one that holds nothing', async (t) => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6, space: 1, topClues: 3 }))
    t.after(() => context.close())
    const before = await layout(page)
    const sides = (await page.evaluate(() => engine.getSizeChanges())).sides
    assert.match(sides.top.remove, /holds a given/)
    assert.match(sides.left.remove, /holds a given/)
    assert.match(await refusal(page, 'top', -1), /holds a given/)
    assert.match(await refusal(page, 'left', -1), /holds a given/)
    assert.deepEqual(await layout(page), before, 'nothing changed')
    await page.evaluate(() => { engine.changeSize('bottom', -1); engine.changeSize('right', -1) })
    const after = await layout(page)
    assert.deepEqual([after.columns, after.rows, after.givens], [before.columns - 1, before.rows - 1, before.givens])
  })

  it('refuses to remove a blank row that holds an entry Penpa+ keeps there', async (t) => {
    const { context, page } = await openNumberBoard()
    t.after(() => context.close())
    await page.evaluate(() => engine.changeSize('top', 1))
    await page.evaluate(() => { pu.pu_a.number[2 + 2 * pu.nx0] = ['5', 2, '1'] })
    assert.match(await refusal(page, 'top', -1), /holds an entry/)
    const after = await layout(page)
    assert.deepEqual([after.rows, after.entries], [5, 1])
  })

  it('refuses to remove a blank row that holds a given thermometer or line', async (t) => {
    for (const topLine of ['thermo', 'line']) {
      const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6, space: 1, topLine }))
      t.after(() => context.close())
      assert.match(await refusal(page, 'top', -1), /holds a given/, topLine)
      assert.equal((await page.evaluate(() => engine.getSizeChanges())).sides.bottom.remove, null, `${topLine}: the bottom row can go`)
    }
  })

  it('refuses to add past Penpa+\'s largest board', async (t) => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 100, rows: 2 }))
    t.after(() => context.close())
    const sides = (await page.evaluate(() => engine.getSizeChanges())).sides
    assert.match(sides.left.add, /100/)
    assert.match(sides.right.add, /100/)
    assert.equal(sides.top.add, null)
    assert.match(await refusal(page, 'left', 1), /100/)
    assert.deepEqual((await shape(page)).columns, 100)
  })

  it('adds and removes on the side named as the board is drawn, when the link turns or flips it', async (t) => {
    for (const options of [{ turn: 90 }, { turn: 180 }, { turn: 270 }, { flip: 'UD' }, { flip: 'LR' }]) {
      const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 3, rows: 2, ...options }))
      t.after(() => context.close())
      const before = await shape(page)
      await page.evaluate(() => engine.changeSize('top', 1))
      const after = await shape(page)
      assert.deepEqual(after, { columns: before.columns, rows: before.rows + 1, given: [before.given[0], before.given[1] + 1] }, JSON.stringify(options))
      await page.evaluate(() => engine.changeSize('right', 1))
      assert.deepEqual(await shape(page), { ...after, columns: after.columns + 1 }, JSON.stringify(options))
      await page.evaluate(() => { engine.changeSize('top', -1); engine.changeSize('right', -1) })
      assert.deepEqual(await shape(page), before, `${JSON.stringify(options)}: removed again`)
    }
  })

  it('keeps the new size through a reload of saved progress and in the solve link', async (t) => {
    const { context, page } = await openNumberBoard({ served: true })
    t.after(() => context.close())
    await page.evaluate(() => { engine.changeSize('top', 1); engine.changeSize('left', 1) })
    const changed = await shape(page)
    assert.equal(await page.evaluate(() => engine.saveProgress()), true)
    const solveLink = await page.evaluate(() => { const url = pu.maketext_solve(); return url.slice(url.indexOf('#')) })
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await shape(page), changed, 'the reload keeps it')
    const fresh = await openSolvePage(browser(), solveLink)
    t.after(() => fresh.context.close())
    assert.deepEqual(await shape(fresh.page), changed, 'the solve link keeps it')
  })

  it('is not taken back by undo, which takes back the entry before it', async (t) => {
    const { context, page } = await openNumberBoard()
    t.after(() => context.close())
    await page.evaluate(typeDigitInPage, { index: DIGIT_CELL, digit: '3' })
    await page.evaluate(() => engine.changeSize('top', 1))
    assert.equal(await page.evaluate(() => engine.undo()), true)
    const after = await layout(page)
    assert.deepEqual([after.rows, after.entries], [5, 0])
  })
})

describe('engine.changeSize on a grid that is not square', () => {
  it('is unavailable, saying why, and refuses every change', async (t) => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 4, rows: 4, gridtype: 'hex' }))
    t.after(() => context.close())
    const changes = await page.evaluate(() => engine.getSizeChanges())
    assert.match(changes.unavailable, /square cells/)
    for (const side of ['top', 'bottom', 'left', 'right']) {
      assert.equal(changes.sides[side].add, changes.unavailable)
      assert.equal(changes.sides[side].remove, changes.unavailable)
    }
    assert.match(await refusal(page, 'top', 1), /square cells/)
  })
})

const openDialog = async (page) => {
  await page.locator(BOARD).getByRole('button', { name: 'Change size' }).click()
  await page.getByRole('dialog', { name: DIALOG }).waitFor()
  // The dialog's content is slotted into Web Awesome's shadow `dialog`, so it is found from the host.
  return page.locator('wa-dialog[open]')
}
const sideHost = (dialog, label) => dialog.locator('wa-button').filter({ hasText: label })

describe('the Change size dialog', () => {
  it('adds and removes a blank row with + and − on a side, shows the size, and refits the board', async (t) => {
    const { context, page, errors } = await openNumberBoard()
    t.after(() => context.close())
    for (let i = 0; i < 3; i++) await page.locator(BOARD).getByRole('button', { name: 'Zoom in' }).click()
    const zoomed = await cellSize(page)
    const dialog = await openDialog(page)
    await dialog.getByText('4 × 4').waitFor()
    await dialog.getByRole('button', { name: 'Add a row above' }).click()
    await dialog.getByText('4 × 5').waitFor()
    assert.deepEqual(await shape(page), { columns: 4, rows: 5, given: [0, 1] })
    const refitted = await settle(() => cellSize(page), (px) => px !== zoomed)
    assert.notEqual(refitted, zoomed, 'the zoom gave way to a fit')
    assert.equal((await boardAgainstCard(page)).inside, true, 'the board fits its card')
    await dialog.getByRole('button', { name: 'Remove the row above' }).click()
    await dialog.getByText('4 × 4').waitFor()
    assert.deepEqual(await shape(page), START)
    assert.deepEqual(errors, [])
  })

  it('says why a side cannot change when its button is pressed, and changes nothing', async (t) => {
    const { context, page } = await openNumberBoard()
    t.after(() => context.close())
    const dialog = await openDialog(page)
    const remove = dialog.getByRole('button', { name: 'Remove the row above' })
    assert.match(await sideHost(dialog, 'Remove the row above').textContent(), /Remove the row above: The top row is part of the grid\./, 'its name says why')
    assert.equal(await sideHost(dialog, 'Remove the row above').getAttribute('data-refused'), '', 'it is dimmed')
    assert.equal(await sideHost(dialog, 'Add a row above').getAttribute('data-refused'), null, 'add is not')
    await remove.click()
    await dialog.getByRole('status').getByText(/part of the grid/).waitFor()
    assert.deepEqual(await shape(page), START)
  })

  it('on a grid that is not square, dims its button, says why and refuses every side', async (t) => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 4, rows: 4, gridtype: 'hex' }))
    t.after(() => context.close())
    const entry = page.locator(`${BOARD} wa-button.ui-change-size`)
    assert.equal(await entry.getAttribute('data-refused'), '', 'the button is dimmed')
    assert.equal(await page.locator(`wa-tooltip[for="${await entry.getAttribute('id')}"]`).textContent(), 'Change size: Only a grid of square cells can change size.')
    const dialog = await openDialog(page)
    await dialog.getByRole('status').getByText(/square cells/).waitFor()
    const sides = dialog.locator('wa-button').filter({ hasText: /^(\u2212|\+)(Add|Remove) / })
    assert.equal(await sides.count(), 8)
    for (const button of await sides.all()) {
      assert.equal(await button.getAttribute('data-refused'), '')
      assert.match(await button.textContent(), /: Only a grid of square cells can change size\.$/)
    }
  })
})

describe('a resize keeps what the solver set on the puzzle', () => {
  const RULES = 'Put a digit from 1 to 9 in every cell.'
  const rules = (page) => page.getByRole('region', { name: 'Rules' })
  const rulesSize = async (page) => {
    const { width, height } = await rules(page).boundingBox()
    return { width: Math.round(width), height: Math.round(height) }
  }
  const pinned = async (page) => (await cardBodyButtons(page, 'Pinned', { name: /^(?!Unpin|Save pins)/ }).allInnerTexts()).map(chipName)

  async function setThings (page) {
    await page.getByRole('button', { name: 'Unpin Line > Normal' }).click()
    await (await openSettings(page)).getByRole('combobox', { name: 'Conflict detection' }).click()
    await page.getByRole('option', { name: 'Off for this puzzle' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
    const handle = await rules(page).getByTestId('resize-bottom-right').boundingBox()
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y + 30, { steps: 5 })
    await page.mouse.up()
  }

  for (const resizes of [1, 2]) {
    it(`keeps the pins, the conflicts-off setting and the Rules card's size after ${resizes} resize(s) and a reload`, async (t) => {
      const link = await newBoardSolveLink(browser(), ['Line Normal', 'Sudoku Corner'], RULES)
      const { context, page } = await openSolvePage(browser(), link, { served: true })
      t.after(() => context.close())
      await setThings(page)
      const size = await rulesSize(page)
      const idBefore = await page.evaluate(() => engine.getPuzzleId())
      await page.evaluate(() => engine.changeSize('top', 1))
      if (resizes === 2) await page.evaluate(() => engine.changeSize('left', 1))
      assert.notEqual(await page.evaluate(() => engine.getPuzzleId()), idBefore, 'the resize moved the puzzle id')
      assert.equal(await page.evaluate(() => engine.saveProgress()), true)
      await page.reload()
      await waitForDesk(page)
      assert.deepEqual(await settle(() => pinned(page), ['Sudoku > Corner']), ['Sudoku > Corner'], 'the pin stays removed')
      assert.equal(await page.evaluate(() => engine.getSettings().conflict_detection), 2, 'conflicts stay off')
      assert.notEqual(await page.evaluate(() => engine.getPuzzleId()), idBefore, 'the reload kept the resized board')
      assert.deepEqual(await settle(() => rulesSize(page), size), size, 'the Rules card keeps its width and height')
    })
  }

  it('keeps a solved puzzle\'s clock stopped when it was undone, resized and reloaded', async (t) => {
    const { context, page } = await openNumberBoard({ served: true })
    t.after(() => context.close())
    await setTool(page, { mode: 'number', submode: '1' })
    await page.waitForFunction(() => engine.getTimer().seconds >= 1)
    await clickCell(page, ANSWER_CELL)
    await page.keyboard.press('2')
    await settle(() => page.evaluate(() => engine.getTimer().paused), true)
    await page.getByRole('button', { name: 'Close', exact: true }).first().click()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the undo took the answer out')
    await page.evaluate(() => engine.changeSize('top', 1))
    assert.equal(await page.evaluate(() => engine.saveProgress()), true)
    await page.reload()
    await waitForDesk(page)
    assert.equal((await page.evaluate(() => engine.getTimer())).paused, true, 'the clock is still stopped')
  })
})

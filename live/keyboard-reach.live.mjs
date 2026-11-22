// Keyboard reach on `solve.html` (#377): from a control, Tab reaches every top-bar and card control in one stable order, Enter
// and Space press a focused card button, and the board's own keys still reach Penpa+. Real key presses; focus is read as the
// page's `document.activeElement` (a Web Awesome control is its host element).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { afterChange, board, currentTool, openSolvePage, setTool, solveLinkOfImport, useBrowser, waitForTool } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'

const browser = useBrowser()

const CELL = 12
// Two tools the puzzle does not pin, so the Recent card holds chips once both have been used.
const UNPINNED_TOOLS = [{ mode: 'sudoku', submode: '2' }, { mode: 'sudoku', submode: '3' }]
const NORMAL_TOOL = { mode: 'sudoku', submode: '1' }

// Runs in the page. The visible, enabled controls of the top bar and the cards, in page order, kept on `window` so a later call
// can say which of them has focus. The Mode card's tree and an open picker list answer their own arrow keys, so of the tree only
// the row Tab stops on counts.
function listControlsInPage () {
  const CONTROL = 'button, wa-button, input, a[href], [role=treeitem]'
  window.reachControls = [...document.querySelectorAll(`.ui-bar :is(${CONTROL}), .ui-card :is(${CONTROL})`)].filter((c) =>
    c.checkVisibility() && !c.disabled && !c.closest('[role=listbox]') &&
    (c.matches('[role=treeitem]') ? c.tabIndex === 0 : !c.closest('[role=tree]')))
  const name = (c) => (c.getAttribute('aria-label') ?? c.getAttribute('label') ?? c.textContent).trim()
  return window.reachControls.map((c) => `${c.closest('section[aria-label]')?.getAttribute('aria-label') ?? 'Top bar'}: ${name(c)}`)
}

// Runs in the page. The index in `listControlsInPage`'s list of the control with focus: -1 for a control the list does not
// hold (one an open picker shows), null when focus is on the page itself.
const focusedControlInPage = () => (document.activeElement === document.body ? null : window.reachControls.indexOf(document.activeElement))

// Presses Tab from the list's first control until focus falls to the page itself, and gives the listed controls it visited in
// order.
async function tabLap (page, limit) {
  await page.evaluate(() => window.reachControls[0].focus())
  const visited = [await page.evaluate(focusedControlInPage)]
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const at = await page.evaluate(focusedControlInPage)
    if (at === null) break
    if (at >= 0) visited.push(at)
  }
  return visited
}

describe('keyboard reach on the solve page', () => {
  let opened
  before(async () => {
    opened = await openSolvePage(browser(), await solveLinkOfImport(browser(), IMPORTS['sudoku-9x9']))
    // Recent notes one tool per change, and two tools set inside one frame make one change.
    for (const tool of [...UNPINNED_TOOLS, NORMAL_TOOL]) {
      await setTool(opened.page, tool)
      await waitForTool(opened.page, tool)
      await afterChange(opened.page)
    }
    await opened.page.getByRole('region', { name: 'Recent' }).getByRole('button', { name: /Corner/ }).first().waitFor()
  })
  after(async () => { await opened?.context.close() })

  it('Tab from the first control reaches every top-bar and card control, in the same order each lap', async () => {
    const { page } = opened
    const names = await page.evaluate(listControlsInPage)
    // More presses than there are controls and the open pickers' own, so a lap that loops is cut off rather than endless.
    const limit = 4 * names.length
    const first = await tabLap(page, limit)
    const missed = names.filter((_, i) => !first.includes(i))
    assert.deepEqual(missed, [], 'controls Tab never reached')
    assert.deepEqual(await tabLap(page, limit), first, 'the second lap visits the controls in the same order')
  })

  for (const key of ['Space', 'Enter']) {
    it(`${key} on a focused pin chip picks its tool and leaves the board as it was`, async () => {
      const { page } = opened
      await setTool(page, NORMAL_TOOL)
      const before = (await board(page)).entered
      const chip = page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /Surface/ }).first()
      await chip.focus()
      await page.keyboard.press(key)
      assert.equal(await settle(async () => (await currentTool(page)).mode, 'surface'), 'surface')
      assert.deepEqual((await board(page)).entered, before)
    })

    it(`${key} on a focused card's close button closes the card`, async () => {
      const { page } = opened
      const card = key === 'Space' ? 'Rules' : 'Mouse'
      await page.getByRole('button', { name: `Close ${card} card` }).focus()
      await page.keyboard.press(key)
      assert.equal(await settle(() => page.getByRole('region', { name: card }).isVisible(), false), false)
    })
  }

  it('on the board a digit still enters and Space still clears the selected cell', async () => {
    const { page } = opened
    await setTool(page, NORMAL_TOOL)
    await clickCell(page, CELL)
    const empty = (await board(page)).entered
    await page.keyboard.press('5')
    assert.notDeepEqual((await board(page)).entered, empty, 'the digit was entered')
    await page.keyboard.press('Space')
    assert.deepEqual((await board(page)).entered, empty, 'Space cleared it')
  })
})

// A press and release on a Pinned or Recent chip's main area switches to that tool (#346), whatever the timing: fast repeats, a few
// pixels of movement between press and release, and no chip text selected. The mouse is real; the tool is read from `engine.getTool()`.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForTool } from './page.mjs'

const browser = useBrowser()

const CLICKS = 20
const MOVED_CLICKS = 10
// 3 px is the ticket's; 6 and 10 are past Chromium's drag threshold (4 px), where a draggable chip starts a drag and a text press starts a selection.
const MOVES_PX = [3, 6, 10]

const openSolve = async (tabSet) => openSolvePage(browser(), await newBoardSolveLink(browser(), tabSet))
const selectedText = (page) => page.evaluate(() => getSelection().toString())

// A press, a move of `movePx` (none when 0), and the release, all on the chip's centre.
async function press (page, chip, movePx) {
  await afterChange(page)
  await chip.waitFor()
  const { x, y, width, height } = await chip.boundingBox()
  await page.mouse.move(x + width / 2, y + height / 2)
  await page.mouse.down()
  if (movePx) {
    await page.mouse.move(x + width / 2 + movePx, y + height / 2, { steps: 3 })
  }
  await page.mouse.up()
}

// Presses the chips of `tools` alternately, and checks each switches the tool and no text is selected.
async function pressAlternately (page, chipOf, tools, count, movePx) {
  for (let i = 0; i < count; i++) {
    const tool = tools[i % tools.length]
    await press(page, chipOf(tool.name), movePx)
    await waitForTool(page, tool.tool, `press ${i + 1} on ${tool.name} switches the tool`)
    assert.equal(await selectedText(page), '', `press ${i + 1} on ${tool.name} selects no text`)
  }
}

const PINNED = [
  { name: 'Line > Normal', tool: { mode: 'line', submode: '1' } },
  { name: 'Sudoku > Corner', tool: { mode: 'sudoku', submode: '2' } }
]
const RECENT = [
  { name: 'Wall', tool: { mode: 'wall', submode: null } },
  { name: 'Surface', tool: { mode: 'surface', submode: null } }
]

describe('a press on a chip', () => {
  let opened
  before(async () => {
    opened = await openSolve(['Line Normal', 'Sudoku Corner'])
    for (const { tool } of RECENT) {
      await setTool(opened.page, tool)
      await waitForTool(opened.page, tool)
      await afterChange(opened.page)
    }
  })
  after(async () => { await opened?.context.close() })

  const chipIn = (card) => (name) => opened.page.getByRole('region', { name: card }).locator('.ui-chip-main').filter({ hasText: name }).first()

  for (const [card, tools] of [['Pinned', PINNED], ['Recent', RECENT]]) {
    it(`switches the tool on every one of ${CLICKS} quick presses on ${card} chips`, async () => {
      await pressAlternately(opened.page, chipIn(card), tools, CLICKS, 0)
    })

    for (const movePx of MOVES_PX) {
      it(`switches the tool on ${MOVED_CLICKS} presses on ${card} chips that move ${movePx} px before the release`, async () => {
        await pressAlternately(opened.page, chipIn(card), tools, MOVED_CLICKS, movePx)
      })
    }
  }

  it('selects no text when a chip is double-clicked', async () => {
    const { page } = opened
    for (const card of ['Pinned', 'Recent']) {
      await chipIn(card)(card === 'Pinned' ? PINNED[0].name : RECENT[0].name).dblclick()
      assert.equal(await selectedText(page), '', `a double click on a ${card} chip selects no text`)
    }
  })
})

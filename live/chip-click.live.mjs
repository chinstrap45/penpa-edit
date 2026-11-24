// The no-selection checks pass with or without the chips' own `user-select: none`: upstream's base CSS already sets it on every element.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, currentTool, newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForTool } from './page.mjs'

const browser = useBrowser()

const CLICKS_PER_CHIP = 20
const MOVED_CLICKS = 10
// 3 px is the ticket's; 6 and 10 are past Chromium's drag threshold (4 px), where a draggable chip starts a drag and a text press starts a selection.
const MOVES_PX = [3, 6, 10]

const openSolve = async (tabSet) => openSolvePage(browser(), await newBoardSolveLink(browser(), tabSet))
const selectedText = (page) => page.evaluate(() => getSelection().toString())

async function press (page, chip, movePx, between) {
  await afterChange(page)
  await chip.waitFor()
  const { x, y, width, height } = await chip.boundingBox()
  await page.mouse.move(x + width / 2, y + height / 2)
  await page.mouse.down()
  if (movePx) {
    await page.mouse.move(x + width / 2 + movePx, y + height / 2, { steps: 3 })
  }
  await between?.()
  await page.mouse.up()
}

async function quickClicks (page, chipOf, tools, count) {
  for (let i = 0; i < count; i++) {
    const tool = tools[i % tools.length]
    await chipOf(tool.name).click()
    const { mode, submode } = await currentTool(page)
    assert.deepEqual({ mode, submode }, tool.tool, `click ${i + 1} on ${tool.name} switches the tool`)
    assert.equal(await selectedText(page), '', `click ${i + 1} on ${tool.name} selects no text`)
  }
}

async function pressAlternately (page, chipOf, tools, count, movePx, between) {
  for (let i = 0; i < count; i++) {
    const tool = tools[i % tools.length]
    await press(page, chipOf(tool.name), movePx, between)
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
    it(`switches the tool on every one of ${CLICKS_PER_CHIP} quick clicks on each ${card} chip`, async () => {
      await quickClicks(opened.page, chipIn(card), tools, CLICKS_PER_CHIP * tools.length)
    })

    it(`switches the tool on a press on a ${card} chip with a board redraw between the press and the release`, async () => {
      await pressAlternately(opened.page, chipIn(card), tools, MOVED_CLICKS, 0, () => opened.page.evaluate(() => pu.redraw()))
    })

    for (const movePx of MOVES_PX) {
      it(`switches the tool on ${MOVED_CLICKS} presses on ${card} chips that move ${movePx} px before the release`, async () => {
        await pressAlternately(opened.page, chipIn(card), tools, MOVED_CLICKS, movePx)
      })
    }
  }

  it('leaves the tool alone when a Pinned chip is dragged onto another chip or off the strip', async () => {
    const { page } = opened
    const wall = RECENT[0].tool
    await setTool(page, wall)
    await waitForTool(page, wall)
    await afterChange(page)
    await chipIn('Pinned')(PINNED[0].name).dragTo(chipIn('Pinned')(PINNED[1].name))
    await afterChange(page)
    await chipIn('Pinned')(PINNED[1].name).dragTo(page.getByRole('region', { name: 'Board' }))
    await afterChange(page)
    assert.deepEqual(await waitForTool(page, wall), wall)
  })
})

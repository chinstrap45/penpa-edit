// The Mode card's "Draw on edges" control (#487): it sets Penpa+'s Draw on Edges option, shows only for the tools the option
// changes, opens with the link's value, and keeps a flip for the visit only.
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { afterChange, board, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { cellPixel, numberPlaces } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const CELL = 8
const NEXT_CELL = 9

const edgesState = (page) => page.evaluate(() => engine.getSettings().draw_edges)

const control = (page) => page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Draw on edges' })
const pressedName = async (page) => control(page).locator('button[aria-pressed=true]').textContent()

async function typeAt (page, pixel, digit) {
  await page.mouse.click(pixel.x, pixel.y)
  await page.keyboard.press(digit)
}

describe('the Draw on edges control', () => {
  const opened = []
  after(async () => { await Promise.all(opened.map((o) => o.context.close())) })

  async function open (query) {
    const page = await openSolvePage(browser(), query)
    opened.push(page)
    return page.page
  }

  let links
  const linksOf = async () => { links ??= { off: await newBoardSolveLink(browser()), on: await newBoardSolveLink(browser(), undefined, undefined, true) }; return links }

  it('puts a Number click on an edge when on, in the cell when off', async () => {
    const page = await open((await linksOf()).off)
    await setTool(page, { mode: 'number', submode: '1' })
    const here = await cellPixel(page, CELL)
    const there = await cellPixel(page, NEXT_CELL)
    const between = { x: (here.x + there.x) / 2, y: (here.y + there.y) / 2 }

    await control(page).getByRole('button', { name: 'On', exact: true }).click()
    assert.equal(await edgesState(page), true)
    await typeAt(page, between, '5')
    assert.deepEqual(await numberPlaces(page), ['edge'])

    await control(page).getByRole('button', { name: 'Off', exact: true }).click()
    assert.equal(await edgesState(page), false)
    await typeAt(page, between, '6')
    assert.deepEqual((await numberPlaces(page)).sort(), ['cell', 'edge'], 'the first digit stays on its edge, the second is in a cell')
    assert.ok((await board(page)).entered.number)
  })

  it('opens on with a link that is on, and a flip is gone after a reload', async () => {
    const { on } = await linksOf()
    const page = await open(on)
    await setTool(page, { mode: 'number', submode: '1' })
    assert.equal(await edgesState(page), true)
    assert.equal((await pressedName(page)).trim(), 'On')
    await control(page).getByRole('button', { name: 'Off', exact: true }).click()
    assert.equal(await edgesState(page), false)
    assert.equal(await settle(async () => (await pressedName(page)).trim(), 'Off'), 'Off', 'the control shows the flip')
    assert.equal(await page.evaluate(() => engine.saveProgress()), true, 'the progress is saved after the flip')
    await page.reload()
    await page.evaluate(() => engine.ready)
    await setTool(page, { mode: 'number', submode: '1' })
    assert.equal(await settle(() => edgesState(page), true), true, 'the link\'s value is back')
    assert.equal((await pressedName(page)).trim(), 'On')
  })

  it('shows for the tools Draw on Edges changes, and not for Surface or Line', async () => {
    const page = await open((await linksOf()).off)
    const shown = {}
    const tools = [
      { mode: 'number', submode: '1' }, { mode: 'number', submode: '3' }, { mode: 'number', submode: '9' }, { mode: 'symbol', submode: 'circle_L' },
      { mode: 'move', submode: '1' }, { mode: 'sudoku', submode: '1' }, { mode: 'surface' }, { mode: 'line', submode: '1' }
    ]
    for (const tool of tools) {
      await setTool(page, tool)
      await afterChange(page)
      shown[`${tool.mode}/${tool.submode ?? ''}`] = await control(page).isVisible()
    }
    assert.deepEqual(shown, { 'number/1': true, 'number/3': false, 'number/9': false, 'symbol/circle_L': true, 'move/1': true, 'sudoku/1': true, 'surface/': false, 'line/1': false })
  })

  it('keeps the control inside the Mode card when the current tool brings it in', async () => {
    const page = await open((await linksOf()).off)
    const card = page.getByRole('region', { name: 'Mode' })
    await setTool(page, { mode: 'surface' })
    await afterChange(page)
    await setTool(page, { mode: 'sudoku', submode: '1' })
    const inside = async () => {
      const [body, group] = await Promise.all([card.locator('.ui-body').boundingBox(), control(page).boundingBox()])
      return group !== null && group.y + group.height <= body.y + body.height + 1 && await card.locator('.ui-body').evaluate((b) => b.scrollHeight <= b.clientHeight)
    }
    assert.equal(await settle(inside, true), true, 'the control and the whole card body show')
  })
})

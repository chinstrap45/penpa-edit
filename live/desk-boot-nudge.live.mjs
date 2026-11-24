// A saved layout opened in a smaller window nudges only the overlaps that window caused (#371): a pair the solver left over
// each other in a desk of the same size stays, every other overlap moves apart, and what moved is kept for a reload.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { overlaps, steady } from './desk-layout.mjs'
import { DESK_SIZE, LONG_RULES_PUZZLE, LAYOUT_KEY, linkFromNewBoard, openSolvePage, puzzleSolveLinkInPage, useBrowser, waitForDesk } from './page.mjs'

const browser = useBrowser()
const SMALLER = { width: 1100, height: 700 }

// The Rules and Mouse cards' saved entries, both in the left column's width, as a solver who placed them in a desk would
// leave them. `apart` keeps Mouse its distance from the desk's bottom, so a shorter desk puts it over Rules; `over` leaves them over each other.
const COLUMN = { x: 14, w: 262 }
const placed = (desk, y, h) => ({ ...COLUMN, y, h, vw: desk.width, vh: desk.height, hw: 1, hh: 1, placed: 1 })
const apart = (desk) => ({ rules: placed(desk, 12, 300), mouse: placed(desk, desk.height - 210 - 300, 300) })
const over = (desk) => ({ rules: placed(desk, 12, 300), mouse: placed(desk, 100, 300) })
// Rules saved with no height, so its current one is its saved one: it reaches down over Mouse.
const overUnsizedRules = (desk) => ({ rules: { x: 14, y: 12, w: 262, vw: desk.width, vh: desk.height }, mouse: placed(desk, 100, 300) })
// Over each other, but saved in desks of two sizes: not a pair the solver made in one desk.
const overAcrossDesks = (desk) => ({ rules: placed(desk, 12, 300), mouse: { ...placed(desk, 100, 300), vw: desk.width + 100 } })

// Runs in the page. Each card's box on the desk, as the desk places it.
function readCardsInPage (names) {
  return Object.fromEntries(names.map((name) => {
    const node = document.querySelector(`section[aria-label="${name}"]`)
    return [name, { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight }]
  }))
}
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
const boxOf = ({ x, y, w, h }) => ({ x, y, w, h })

describe('opening a saved layout in a smaller window (#371)', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  // A page on the DESK_SIZE desk whose kept layout has Rules and Mouse as `entriesFor(desk)` says, the rest as the fit kept
  // them. Returns the page and those entries.
  async function openSaved (entriesFor) {
    opened = await openSolvePage(browser(), await linkFromNewBoard(browser(), puzzleSolveLinkInPage, LONG_RULES_PUZZLE), { contextOptions: DESK_SIZE })
    const { page } = opened
    // A kept layout is written by the first card the solver drags.
    const head = await page.getByRole('region', { name: 'Rules' }).getByRole('heading', { name: 'Rules' }).boundingBox()
    await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2)
    await page.mouse.down()
    await page.mouse.move(head.x + head.width / 2 + 30, head.y + head.height / 2 + 30, { steps: 5 })
    await page.mouse.up()
    const desk = await page.evaluate(() => ({ width: document.querySelector('.ui-desk').clientWidth, height: document.querySelector('.ui-desk').clientHeight }))
    const entries = entriesFor(desk)
    await page.evaluate(([key, kept]) => {
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), ...kept }))
    }, [LAYOUT_KEY, entries])
    return { page, entries }
  }
  // The page opened afresh in a window of `viewport`: the old page is left first, so it writes nothing over the saved layout.
  const openAt = async (page, viewport) => {
    const { href } = await page.evaluate(() => ({ href: location.href }))
    await page.goto('about:blank')
    await page.setViewportSize(viewport)
    await page.goto(href)
    await waitForDesk(page)
    return steady(page, readCardsInPage, CARDS)
  }

  it('nudges two cards the solver placed apart that the smaller window put over each other, and keeps that for a reload', async () => {
    const { page } = await openSaved(apart)
    const cards = await openAt(page, SMALLER)
    assert.equal(overlaps(cards.Rules, cards.Mouse), false, `Rules and Mouse overlap: ${JSON.stringify([cards.Rules, cards.Mouse])}`)
    assert.deepEqual(await openAt(page, SMALLER), cards)
  })

  it('leaves two cards the solver placed over each other where they were', async () => {
    const { page, entries } = await openSaved(over)
    const cards = await openAt(page, SMALLER)
    assert.deepEqual([boxOf(cards.Rules), boxOf(cards.Mouse)], [{ x: 14, y: 12, w: 262, h: 300 }, { x: 14, y: 100, w: 262, h: 300 }], JSON.stringify(entries))
  })

  it('leaves a pair over each other where they were when a saved card has no height', async () => {
    const { page } = await openSaved(overUnsizedRules)
    const cards = await openAt(page, SMALLER)
    assert.equal(cards.Mouse.y, 100)
    assert.equal(overlaps(cards.Rules, cards.Mouse), true, `Rules and Mouse were nudged apart: ${JSON.stringify([cards.Rules, cards.Mouse])}`)
  })

  it('keeps no layout for a page first opened in a small window', async () => {
    opened = await openSolvePage(browser(), await linkFromNewBoard(browser(), puzzleSolveLinkInPage, LONG_RULES_PUZZLE), { contextOptions: { viewport: { width: 900, height: 500 } } })
    await steady(opened.page, readCardsInPage, CARDS)
    assert.equal(await opened.page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY), null)
  })

  it('nudges two cards over each other that were saved in desks of two sizes', async () => {
    const { page } = await openSaved(overAcrossDesks)
    const cards = await openAt(page, SMALLER)
    assert.equal(overlaps(cards.Rules, cards.Mouse), false, `Rules and Mouse overlap: ${JSON.stringify([cards.Rules, cards.Mouse])}`)
  })

  it('moves no card when the window is the size it was saved in', async () => {
    const { page, entries } = await openSaved(apart)
    const cards = await openAt(page, DESK_SIZE.viewport)
    assert.deepEqual([boxOf(cards.Rules), boxOf(cards.Mouse)], [{ x: 14, y: 12, w: 262, h: 300 }, { x: 14, y: entries.mouse.y, w: 262, h: 300 }])
  })
})

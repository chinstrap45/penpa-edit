// A saved layout opened in a smaller window nudges only the overlaps that window caused (#371): a pair the solver placed
// over each other in a desk of the same size stays, every other overlap moves apart, and what moved is kept for a reload.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { steady } from './desk-layout.mjs'
import { DESK_SIZE, ICEBREAKER, linkFromNewBoard, openSolvePage, puzzleSolveLinkInPage, useBrowser, waitForDesk } from './page.mjs'

const browser = useBrowser()
const LAYOUT_KEY = 'chinstrap-solve-layout-v1'
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
const SMALLER = { width: 1100, height: 700 }

// The saved places of the Rules and Mouse cards, both in the left column's width, as the solver placed them in the desk.
// Stacked apart, Mouse sits in the lower half, so a desk 200px lower puts it over Rules; stacked over each other they overlap
// in any desk of this width.
const COLUMN = { x: 14, w: 262 }
const placed = (desk, y, h) => ({ ...COLUMN, y, h, vw: desk.width, vh: desk.height, hw: 1, hh: 1, placed: 1 })
const apart = (desk) => ({ rules: placed(desk, 12, 300), mouse: placed(desk, desk.height - 210 - 300, 300) })
const over = (desk) => ({ rules: placed(desk, 12, 300), mouse: placed(desk, 100, 300) })
// Over each other, but saved in desks of two sizes: not a pair the solver made.
const overAcrossDesks = (desk) => ({ rules: placed(desk, 12, 300), mouse: { ...placed(desk, 100, 300), vw: desk.width + 100 } })

function readCardsInPage (names) {
  const box = (name) => {
    const r = document.querySelector(`section[aria-label="${name}"]`).getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  return Object.fromEntries(names.map((name) => [name, box(name)]))
}
const meet = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

describe('opening a saved layout in a smaller window (#371)', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  // A page on the DESK_SIZE desk whose kept layout has Rules and Mouse as `entriesFor(desk)` says, the rest as the fit kept them.
  async function openSaved (entriesFor) {
    opened = await openSolvePage(browser(), await linkFromNewBoard(browser(), puzzleSolveLinkInPage, ICEBREAKER), { contextOptions: DESK_SIZE })
    const { page } = opened
    const head = await page.getByRole('region', { name: 'Rules' }).getByRole('heading', { name: 'Rules' }).boundingBox()
    await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2)
    await page.mouse.down()
    await page.mouse.move(head.x + head.width / 2 + 30, head.y + head.height / 2 + 30, { steps: 5 })
    await page.mouse.up()
    const desk = await page.evaluate(() => ({ width: document.querySelector('.ui-desk').clientWidth, height: document.querySelector('.ui-desk').clientHeight }))
    const kept = entriesFor(desk)
    await page.evaluate(([key, entries]) => {
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), ...entries }))
    }, [LAYOUT_KEY, kept])
    return page
  }
  const reloadAt = async (page, viewport) => {
    await page.setViewportSize(viewport)
    await page.reload()
    await waitForDesk(page)
    return steady(page, readCardsInPage, CARDS)
  }

  it('nudges two cards the solver placed apart that the smaller window put over each other, and keeps that for a reload', async () => {
    const page = await openSaved(apart)
    const cards = await reloadAt(page, SMALLER)
    assert.equal(meet(cards.Rules, cards.Mouse), false, `Rules and Mouse overlap: ${JSON.stringify([cards.Rules, cards.Mouse])}`)
    assert.deepEqual(await reloadAt(page, SMALLER), cards)
  })

  it('leaves two cards the solver placed over each other where they were', async () => {
    const page = await openSaved(over)
    const cards = await reloadAt(page, SMALLER)
    assert.equal(meet(cards.Rules, cards.Mouse), true, `Rules and Mouse were nudged apart: ${JSON.stringify([cards.Rules, cards.Mouse])}`)
  })

  it('nudges two cards over each other that were saved in desks of two sizes', async () => {
    const page = await openSaved(overAcrossDesks)
    const cards = await reloadAt(page, SMALLER)
    assert.equal(meet(cards.Rules, cards.Mouse), false, `Rules and Mouse overlap: ${JSON.stringify([cards.Rules, cards.Mouse])}`)
  })

  it('moves no card when the window is the size it was saved in', async () => {
    const page = await openSaved(apart)
    const before = await reloadAt(page, DESK_SIZE.viewport)
    assert.deepEqual(await reloadAt(page, DESK_SIZE.viewport), before)
    assert.equal(meet(before.Rules, before.Mouse), false)
  })
})

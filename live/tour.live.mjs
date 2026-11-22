// The solve page's tour (#381, GLOSSARY.md **Tour**): on a first visit it walks through what differs from Penpa+'s page,
// one stop per difference, each pointing at its card or control with the rest of the page dimmed. Skip (or Escape) at any
// stop ends it, and so does Done at the last; after either it does not show again, across reloads, until Settings
// replays it. A stop whose element is not shown is left out. The tour is found by role and name, each stop's element by
// the role or class the solver sees it by.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { settle } from './settle.mjs'
import { afterChange, newBoardSolveLink, openSolvePage, TOUR_KEY, TOUR_SEEN, useBrowser, waitForDesk } from './page.mjs'

const browser = useBrowser()

// The most characters a stop's line holds: one short line, never a paragraph (Chris, 2026-11-22).
const MAX_STOP_CHARS = 80
// How far the popup may sit from the element it points at, in pixels: its distance plus its arrow.
const MAX_POPUP_GAP_PX = 24
// How far the lit window may reach past the element it lights, in pixels.
const MAX_SPOTLIGHT_PAD_PX = 8

// Each stop's element, in the order the tour visits them.
const STOPS = [
  (page) => page.getByRole('region', { name: 'Board' }).locator('.ui-head'),
  (page) => page.getByRole('region', { name: 'Mode' }),
  (page) => page.getByRole('region', { name: 'Pinned' }),
  (page) => page.getByRole('region', { name: 'Mouse' }),
  (page) => page.getByRole('button', { name: 'Try', exact: true }),
  (page) => page.getByRole('region', { name: 'Rules' }).locator('.ui-rules-text'),
  (page) => page.getByRole('button', { name: 'Penpa+', exact: true })
]

const tour = (page) => page.getByRole('dialog', { name: 'Tour' })
const tourButton = (page, name) => tour(page).getByRole('button', { name, exact: true })
// A link with rules, since the Rules card shows its text size buttons only when it has some.
const withRules = () => newBoardSolveLink(browser(), undefined, 'Shade some cells.')
const openFirstVisit = async () => openSolvePage(browser(), await withRules(), { tour: true })

// The tour is up once the desk is built, so after two frames past that a tour that is not there is not coming.
async function tourShownAfterLoad (page) {
  await waitForDesk(page)
  await afterChange(page)
  return tour(page).count()
}

// How far apart two boxes are: 0 when they touch or overlap.
const gapBetween = (a, b) => Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width), a.y - (b.y + b.height), b.y - (a.y + a.height))

// What the stop on screen shows, and where its parts sit against `target`.
async function readStop (page, target) {
  const dialog = tour(page)
  const text = dialog.locator('.ui-tour-text')
  const [box, popupBox, lit] = await Promise.all([target.boundingBox(), dialog.boundingBox(), page.locator('.ui-tour-spotlight').boundingBox()])
  return {
    text: (await text.textContent()).trim(),
    count: await stopCount(page),
    lines: await text.evaluate((node) => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))),
    popupGap: gapBetween(popupBox, box),
    spotlightPad: Math.max(box.x - lit.x, box.y - lit.y, lit.x + lit.width - (box.x + box.width), lit.y + lit.height - (box.y + box.height)),
    spotlightCovers: lit.x <= box.x + 1 && lit.y <= box.y + 1 && lit.x + lit.width >= box.x + box.width - 1 && lit.y + lit.height >= box.y + box.height - 1
  }
}

// The stop counter, such as "3 of 7".
const stopCount = async (page) => (await tour(page).locator('.ui-tour-count').textContent()).trim()
const storedTour = (page) => page.evaluate((key) => localStorage.getItem(key), TOUR_KEY)

describe('the tour on a first visit', () => {
  let opened
  before(async () => { opened = await openFirstVisit() })
  after(async () => { await opened?.context.close() })

  it('shows every stop in turn, each one short line pointing at its element, and Done ends it for good', async () => {
    const { page } = opened
    await tour(page).waitFor()
    for (const [i, target] of STOPS.entries()) {
      const stop = await readStop(page, target(page))
      assert.equal(stop.count, `${i + 1} of ${STOPS.length}`)
      assert.equal(stop.lines, 1, `stop ${i + 1} is one line: ${stop.text}`)
      assert.ok(stop.text.length <= MAX_STOP_CHARS, `stop ${i + 1} is short (${stop.text.length} characters): ${stop.text}`)
      assert.ok(stop.popupGap <= MAX_POPUP_GAP_PX, `stop ${i + 1}'s popup sits ${stop.popupGap} px from its element`)
      assert.equal(stop.spotlightCovers, true, `stop ${i + 1} lights its whole element`)
      assert.ok(stop.spotlightPad <= MAX_SPOTLIGHT_PAD_PX, `stop ${i + 1} lights ${stop.spotlightPad} px past its element`)
      await tourButton(page, i === STOPS.length - 1 ? 'Done' : 'Next').click()
    }
    await tour(page).waitFor({ state: 'detached' })
    assert.equal(await page.locator('.ui-tour-spotlight').count(), 0, 'the dimmed backdrop goes with it')
    assert.equal(await storedTour(page), TOUR_SEEN)
    await page.reload()
    assert.equal(await tourShownAfterLoad(page), 0, 'a finished tour does not come back')
  })
})

describe('skipping the tour', () => {
  it('Skip at a middle stop ends it, and a reload does not show it', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await tourButton(page, 'Next').click()
      await tourButton(page, 'Next').click()
      assert.equal(await stopCount(page), `3 of ${STOPS.length}`)
      await tourButton(page, 'Skip tour').click()
      await tour(page).waitFor({ state: 'detached' })
      await page.reload()
      assert.equal(await tourShownAfterLoad(page), 0, 'a skipped tour does not come back')
    } finally {
      await context.close()
    }
  })

  it('Escape skips it, and the key does not reach the board', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await tour(page).waitFor()
      const board = () => page.evaluate(() => JSON.stringify(engine.getState()))
      const before = await board()
      await page.keyboard.press('1')
      await page.keyboard.press('Escape')
      await tour(page).waitFor({ state: 'detached' })
      assert.equal(await board(), before, 'the board took no key while the tour was up')
      assert.equal(await storedTour(page), TOUR_SEEN)
    } finally {
      await context.close()
    }
  })

  it('takes no click meant for the page under it', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await tour(page).waitFor()
      await page.getByRole('button', { name: 'Settings', exact: true }).click({ force: true })
      await afterChange(page)
      assert.equal(await page.getByRole('dialog', { name: 'Settings' }).count(), 0, 'the dimmed page took the click')
    } finally {
      await context.close()
    }
  })
})

// Presses Settings' Show the tour, and waits for the tour to show and Settings to close.
async function replayFromSettings (page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await page.locator('wa-dialog[open]').getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Show the tour' }).click()
  await tour(page).waitFor()
  await settings.waitFor({ state: 'hidden' })
}

describe('Settings', () => {
  it('replays the tour from its first stop, for a visitor who has seen it', async () => {
    const { context, page } = await openSolvePage(browser(), await withRules())
    try {
      assert.equal(await tourShownAfterLoad(page), 0, 'a visitor who has seen it is not shown it')
      await replayFromSettings(page)
      assert.equal(await stopCount(page), `1 of ${STOPS.length}`)
      const stop = await readStop(page, STOPS[0](page))
      assert.equal(stop.spotlightCovers, true, 'the replay points at the first stop\'s element')
      await page.keyboard.press('Enter')
      assert.equal(await settle(() => stopCount(page), `2 of ${STOPS.length}`), `2 of ${STOPS.length}`, 'Enter presses Next, which has focus')
    } finally {
      await context.close()
    }
  })

  it('leaves out the stop of a closed card', async () => {
    const { context, page } = await openSolvePage(browser(), await withRules())
    try {
      await page.getByRole('button', { name: 'Close Mouse card' }).click()
      await page.getByRole('region', { name: 'Mouse' }).waitFor({ state: 'hidden' })
      await replayFromSettings(page)
      const counts = []
      for (let i = 0; i < STOPS.length - 1; i++) {
        counts.push(await stopCount(page))
        await tourButton(page, i === STOPS.length - 2 ? 'Done' : 'Next').click()
      }
      assert.deepEqual(counts, [1, 2, 3, 4, 5, 6].map((k) => `${k} of 6`))
      await tour(page).waitFor({ state: 'detached' })
    } finally {
      await context.close()
    }
  })
})

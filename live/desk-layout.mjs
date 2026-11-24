// The layout constants and reads the live tests of solve.html's desk share. Not a check itself, so `live/**/*.live.mjs` skips it.
import { afterChange } from './page.mjs'
import { settle } from './settle.mjs'

// Box edges may differ by rounding.
export const SLACK_PX = 1
// desk.js's gap between two cards of a column.
export const CARD_GAP_PX = 10
// desk.js's Mouse body slack for its borders, and rounding.
export const MOUSE_SLACK_PX = 3
// The Mouse and Mode cards' smallest heights (desk.js's MIN_SIZE).
export const MOUSE_MIN_HEIGHT_PX = 140
export const MODE_MIN_HEIGHT_PX = 170

// The desk's cards, by name, in the order the fuzz's card actions index them.
export const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
// desk.js's margin above and below the columns.
export const TOP_MARGIN_PX = 12

// Whether two boxes (`x`, `y`, `w`, `h`) overlap by more than the rounding.
export const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

// Reads `inPage` until two reads in a row agree, and returns the last: the page lays out after it renders, so a read
// is taken once nothing moves. Each read follows two rendered frames, since a ResizeObserver runs only in a frame: on a
// loaded box two reads can both land before the frame that moves the page (#323).
export async function steady (page, inPage, arg) {
  let last = null
  await settle(async () => {
    await afterChange(page)
    const now = JSON.stringify(await page.evaluate(inPage, arg))
    const same = now === last
    last = now
    return same
  }, true)
  return JSON.parse(last)
}

// Runs in the page. The desk's box and each named card's, null for a card that is not shown.
export function readDeskInPage (names) {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  return {
    desk: rect(document.querySelector('.ui-desk')),
    cards: Object.fromEntries(names.map((name) => {
      const node = document.querySelector(`section[aria-label="${name}"]`)
      return [name, node.offsetParent === null ? null : rect(node)]
    }))
  }
}

// Presses at `point`, moves by `dx`, `dy` in steps and lets go.
export async function dragFrom (page, point, dx, dy) {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 })
  await page.mouse.up()
}

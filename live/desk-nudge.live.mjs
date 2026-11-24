// The desk nudges, never refits: after a window resize, a reload or a card that grows, a card that overlaps another
// or falls outside the window moves back, and a card that needed no move stays. The lists are the failures the nightly
// UI fuzz found, shrunk, run through the fuzz's own rules (`cards-do-not-overlap`, `cards-inside-window`,
// `reload-keeps-layout-and-pins`). The boxes of a hand-made layout are read in `laptop-desk.live.mjs`.
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { dragAction as drag, interruptedDragAction as interrupted, resizeAction as resize, scriptedList, WINDOW_SIZES } from './ui-fuzz/actions.mjs'
import { runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { openTarget } from './ui-fuzz/target.mjs'

const browser = useBrowser()
const puzzles = await uiFuzzPuzzles()
const puzzleNamed = (name) => puzzles.find((p) => p.name === name)

const windowIndex = (width) => WINDOW_SIZES.findIndex((size) => size.width === width)

const LISTS = [
  ['a window resized twice in a row leaves no card over another', 'slitherlink', [['resize', windowIndex(1440)], ['resize', windowIndex(1366)]]],
  ['a tool picked after a Board resize and a pin leaves Board clear of the Recent card that grew', 'or-shading', [
    resize('Board', 'bottom-right', 20, 20),
    resize('Board', 'bottom-left', -240, -80),
    ['recent pin', 0],
    ['mode pick', 1]
  ]],
  ['a preset saved under a Mode card the solver moved keeps Recent inside the window', 'sudoku-9x9', [
    interrupted('Mouse', 'resize'),
    drag('Mode', -240, 240),
    ['preset save', 0]
  ]],
  ['a reload after a Board resize and a window resize opens on the Board the window left', 'sudoku-6x6', [
    resize('Board', 'top', -240, -240),
    interrupted('Mouse', 'resize'),
    ['reload', null]
  ]],
  ['a reload after the Pinned card was dragged leaves Mode where it was', 'slitherlink', [
    drag('Pinned', -240, 240),
    ['reload', null]
  ]]
]

describe('the desk nudges cards back, never refits (#344, #369)', () => {
  for (const [title, name, steps] of LISTS) {
    it(title, async () => {
      await runScript({ openTarget: openTarget(browser()), puzzle: puzzleNamed(name), actions: scriptedList(steps) })
    })
  }
})

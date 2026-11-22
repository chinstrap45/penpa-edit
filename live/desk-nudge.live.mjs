// The desk nudges, never refits (#344): after a window resize, a reload or a card that grows, a card that overlaps another
// or falls outside the window moves back, and a card that needed no move stays. The four lists are the failures the nightly
// UI fuzz found, shrunk, run through the fuzz's own rules (`cards-do-not-overlap`, `cards-inside-window`,
// `reload-keeps-layout-and-pins`); the last test reads boxes on a hand-made layout.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { scriptedList } from './ui-fuzz/actions.mjs'
import { runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { openTarget } from './ui-fuzz/target.mjs'

const browser = useBrowser()
const puzzles = await uiFuzzPuzzles()
const puzzleNamed = (name) => puzzles.find((p) => p.name === name)

// The window sizes' indexes in `WINDOW_SIZES`.
const [W1366, W1440] = [0, 1]
// `CARDS`' indexes and `HANDLES`' (`live/ui-fuzz/actions.mjs`), and `MOVES`' for -240, -80 and 20.
const [BOARD, MOUSE, MODE] = [0, 1, 4]
const [BOTTOM_RIGHT, BOTTOM_LEFT, TOP] = [6, 7, 0]
const [BACK_240, BACK_80, FORWARD_20, FORWARD_240] = [0, 1, 4, 6]

const LISTS = [
  ['a window resized twice in a row leaves no card over another', 'slitherlink', [['resize', W1440], ['resize', W1366]]],
  ['a tool picked after a Board resize and a pin leaves Board clear of the Recent card that grew', 'or-shading', [
    ['card resize', [BOARD, BOTTOM_RIGHT, FORWARD_20, FORWARD_20]],
    ['card resize', [BOARD, BOTTOM_LEFT, BACK_240, BACK_80]],
    ['recent pin', 0],
    ['mode pick', 1]
  ]],
  ['a preset saved under a Mode card the solver moved keeps Recent inside the window', 'sudoku-9x9', [
    ['interrupted drag', [MOUSE, 'resize']],
    ['card drag', [MODE, BACK_240, FORWARD_240]],
    ['preset save', 0]
  ]],
  ['a reload after a Board resize and a window resize opens on the Board the window left', 'sudoku-6x6', [
    ['card resize', [BOARD, TOP, BACK_240, BACK_240]],
    ['interrupted drag', [MOUSE, 'resize']],
    ['reload', null]
  ]]
]

describe('the desk nudges cards back, never refits (#344)', () => {
  for (const [title, name, steps] of LISTS) {
    it(`${title}`, async () => {
      await runScript({ openTarget: openTarget(browser()), puzzle: puzzleNamed(name), actions: scriptedList(steps) })
    })
  }
})

// Generates the corpus of recordings (GLOSSARY.md) with the recorder, by real mouse and keyboard on a `?record=1` page,
// and writes each one's expected file from a replay: `node live/generate-recordings.mjs [<id prefix> ...]`, every
// recording whose id starts with a prefix given, or all of them. A recording whose replay is refused is written with
// no expected file, any earlier one removed, and named at the end, so it fails the seam until it is ruled on. Not a check itself, so
// `live/**/*.live.mjs` skips it. The design is `research/agentic-legacy-migration.md` § Corpus:
// - tier A, every solve mode's sub-modes, Composite tools and Shape's two key paths on one small square puzzle, the
//   clearing keys in Number, Shape and Multicolor, and a solve link saved in Number Arrow;
// - tier B, the smallest of upstream's puzz.link imports per genre in the mode the import opens in, and a Penpa+ board
//   of each grid class no import builds. A genre whose smallest import does not record (its solve link does not boot)
//   takes its next smallest, and the header's `import` names the one taken.
// The header's `tier` (`A` or `B`) marks a recording as generated.
import { rm } from 'node:fs/promises'
import { chromium } from 'playwright'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa, withPage } from './page.mjs'
import { cases, readSnapshot } from './puzzlink-cases.mjs'
import { EXPECTED_SUFFIX, RECORDINGS, writeExpected, writeRecording } from './recordings.mjs'
import {
  ANSWER_CELLS, downloadRecording, engineCommit, linkHash, makeSurfaceSolveLink, pointPixel, replay
} from './replay.mjs'
import { settle } from './settle.mjs'

const COMMIT = engineCommit()

// Indices in `pu.centerlist`, taken modulo its length, of the cells each gesture starts at, none of them tier A's
// ANSWER_CELLS, so a gesture does not shade the answer whole.
const CELLS = { click: 0, drag: 4, corners: 8, edges: 12, right: 2, ctrl: 13 }
// `pu.point` types, each a list in order of preference: a cell's centre, a cell's corner, and the middle of a cell's
// edge, which Wall draws along (on a square board type 3, top and bottom edges; a uniform board has only type 2).
const CENTRE = [0]
const CORNER = [1]
const EDGE = [3, 2]

const FAMILY = {
  sudoku: 'value',
  number: 'value',
  surface: 'paint',
  multicolor: 'paint',
  line: 'path',
  lineE: 'path',
  wall: 'path',
  symbol: 'stamp',
  special: 'stamp',
  cage: 'stamp',
  combi: 'genre-tool',
  move: 'move'
}
// One Shape tool on each of `key_number`'s two paths: a plain variant number, and one from `onoff_symbolmode_list`.
const SHAPE_TOOLS = ['circle_L', 'cross']
// The modes the clearing keys are recorded in, which the gesture set does not press: Number on a cell and on a
// corner, whose Backspace deletes one character, Shape, whose Ctrl+Space clears a shape, and Multicolor, whose
// Delete clears a colour.
const CLEAR_KEY_PAIRS = [
  { mode: 'number', sub: '1', name: 'Normal' },
  { mode: 'number', sub: '3', name: 'sub 3' },
  { mode: 'symbol', tool: SHAPE_TOOLS[0], name: SHAPE_TOOLS[0] },
  { mode: 'multicolor', name: '' }
]
const GRID_BOARDS = { hex: 2, tri: 3, pyramid: 3, uniform: 2 }
const UNIFORM_TILING = 'truncated_square'

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

if (Object.values(CELLS).some((c) => ANSWER_CELLS.includes(c))) throw new Error('a gesture starts on one of ANSWER_CELLS')

function runInPage ({ cell, types, length }) {
  const canvas = document.getElementById('canvas')
  const onCanvas = (p) => p.x > 0 && p.x < canvas.clientWidth && p.y > 0 && p.y < canvas.clientHeight
  const all = pu.point.map((p, num) => p && { ...p, num }).filter((p) => p && onCanvas(p))
  const type = types.find((t) => all.some((p) => p.type === t))
  const points = all.filter((p) => p.type === type)
  const centre = pu.point[pu.centerlist[cell % pu.centerlist.length]]
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const nearest = (from, among) => among.reduce((best, p) => (!best || distance(from, p) < distance(from, best) ? p : best), null)
  const run = [nearest(centre, points)].filter(Boolean)
  while (run.length && run.length < length) {
    const last = run.at(-1)
    const unused = points.filter((p) => !run.includes(p))
    const next = nearest(last, unused.filter((p) => p.x > last.x + 1)) ?? nearest(last, unused)
    if (!next) break
    run.push(next)
  }
  // The key panel Shape mode opens floats over the board, and a click on it never reaches the board; a solver drags
  // it aside. Still open, so `UserSettings.panel_shown` stays as the engine set it.
  document.getElementById('float-key').style.left = '-10000px'
  return run.map((p) => p.num)
}

function notBoardInPage ({ x, y }) {
  const hit = document.elementFromPoint(x, y)
  return hit?.id === 'canvas' ? null : hit?.id || hit?.tagName || 'nothing'
}

async function pixelRun (page, cell, types, length = 1) {
  const pixels = []
  for (const num of await page.evaluate(runInPage, { cell, types, length })) {
    const pixel = await pointPixel(page, num)
    const other = await page.evaluate(notBoardInPage, pixel)
    if (other) throw new Error(`the gesture's point ${num} at ${pixel.x},${pixel.y} is on ${other}, not the board`)
    pixels.push(pixel)
  }
  if (pixels.length < length) throw new Error(`the board has a run of ${pixels.length} points of types ${types} from cell ${cell}, not ${length}`)
  return pixels
}

async function drag (page, run) {
  await page.mouse.move(run[0].x, run[0].y)
  await page.mouse.down()
  for (const p of run.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 })
  await page.mouse.up()
}

async function gestures (page, { beforeCtrl } = {}) {
  const [click] = await pixelRun(page, CELLS.click, CENTRE)
  await page.mouse.click(click.x, click.y)
  await page.keyboard.press('1')
  await page.mouse.click(click.x, click.y)
  await drag(page, await pixelRun(page, CELLS.drag, CENTRE, 3))
  await page.keyboard.press('2')
  await drag(page, await pixelRun(page, CELLS.corners, CORNER, 3))
  await drag(page, await pixelRun(page, CELLS.edges, EDGE, 2))
  const [right] = await pixelRun(page, CELLS.right, CENTRE)
  await page.mouse.click(right.x, right.y, { button: 'right' })
  await beforeCtrl?.()
  const [ctrl] = await pixelRun(page, CELLS.ctrl, CENTRE)
  await page.keyboard.down('Control')
  await page.mouse.click(ctrl.x, ctrl.y)
  await page.keyboard.up('Control')
  await page.keyboard.press('3')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('4')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+y')
}

function solveLinkInPage () {
  return pu.maketext_solve()
}

function newBoardInPage ({ gridtype, size }) {
  UserSettings.gridtype = gridtype
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  document.getElementById('nb_size3').value = size
  create_newboard()
}

class NoBoot extends Error {}

async function record (browser, query, act, header) {
  const opened = await openPenpa(browser, '?record=1' + query).catch((e) => { throw new NoBoot(e.message) })
  const { context, page } = opened
  try {
    await settle(() => page.evaluate(readEngineState).then(canonicalState))
    // The recorder wraps `pu` on the first input event, so the first mode change must come after one.
    await page.mouse.move(1, 1)
    await act(page)
    const { text, recording } = await downloadRecording(page)
    recording.header = { ...recording.header, commit: COMMIT, ...header }
    // The recorder writes the header alone on the first line.
    const lines = text.split('\n')
    lines[0] = '{"header": ' + JSON.stringify(recording.header) + ','
    return { text: lines.join('\n'), recording }
  } finally {
    await context.close()
  }
}

function tierAInPage (shapeTools) {
  const pairs = []
  const visible = (id) => document.getElementById(id)?.offsetParent != null
  for (const label of document.querySelectorAll('[id^="mo_"][id$="_lb"]')) {
    if (!visible(label.id)) continue
    const mode = label.id.slice(3, -3)
    if (mode === 'symbol') {
      for (const tool of shapeTools) pairs.push({ mode, tool, name: tool })
    } else if (mode === 'combi') {
      for (const el of document.querySelectorAll('[id^="combisub_"]')) pairs.push({ mode, tool: el.id.slice(9), name: el.id.slice(9) })
    } else {
      pu.mode_set(mode)
      const subs = [...document.querySelectorAll(`input[name="mode_${mode}"]`)].filter((e) => visible(e.id + '_lb'))
      if (!subs.length) pairs.push({ mode, name: '' })
      // Number's 1/4 and Side labels are drawn by CSS and hold no text.
      for (const e of subs) pairs.push({ mode, sub: e.value, name: document.getElementById(e.id + '_lb').textContent || `sub ${e.value}` })
    }
  }
  return pairs
}

async function chooseMode (page, { mode, sub, tool }) {
  await page.click(`#mo_${mode}_lb`)
  if (sub) await page.click(`#sub_${mode}${sub}_lb`)
  if (tool) await page.dispatchEvent(`#${mode === 'symbol' ? 'ms_' : 'combisub_'}${tool}`, 'mousedown')
}

async function tierA (browser) {
  const query = await makeSurfaceSolveLink(browser)
  const { context, page } = await openPenpa(browser, query)
  const pairs = await page.evaluate(tierAInPage, SHAPE_TOOLS).finally(() => context.close())
  const idOf = (pair, ...more) => `${FAMILY[pair.mode]}/${slug([pair.mode, pair.name, ...more].filter(Boolean).join(' '))}`
  return [
    ...pairs.map((pair) => ({ id: idOf(pair), tier: 'A', boards: [async () => ({ query })], act: (page) => inMode(page, pair) })),
    ...CLEAR_KEY_PAIRS.map((pair) => ({
      id: idOf(pair, 'clear keys'), tier: 'A', boards: [async () => ({ query })], act: (page) => clearKeys(page, pair)
    })),
    {
      id: 'value/number-arrow-link',
      tier: 'A',
      boards: [async () => ({ query: await solveLink(browser, (p) => p.evaluate(arrowBoardInPage)) })],
      act: (page) => gestures(page)
    }
  ]
}

// Runs in the page: a new board whose solve layer is in Number Arrow. Solve mode hides Arrow's button, but a solve link
// opens in the mode it was saved in, so this is the one way a solver's click reaches `mouse_number`.
function arrowBoardInPage () {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.mode_qa('pu_a')
  pu.mode_set('number')
  pu.submode_check('sub_number2')
}

async function clearKeys (page, pair) {
  await chooseMode(page, pair)
  const [click] = await pixelRun(page, CELLS.click, CENTRE)
  await page.mouse.click(click.x, click.y)
  for (const key of ['9', '2', 'Backspace', '3', 'Delete', '4', 'Control+Space']) await page.keyboard.press(key)
}

async function inMode (page, pair) {
  if (pair.mode === 'move') {
    const [start, next] = await pixelRun(page, CELLS.drag, CENTRE, 2)
    await chooseMode(page, { mode: 'number' })
    await page.mouse.click(start.x, start.y)
    await page.keyboard.press('5')
    await chooseMode(page, { mode: 'symbol', tool: SHAPE_TOOLS[0] })
    await page.mouse.click(next.x, next.y)
  }
  if (pair.mode === 'lineE' && pair.name === 'Erase') {
    await chooseMode(page, { mode: 'lineE' })
    await drag(page, await pixelRun(page, CELLS.corners, CORNER, 3))
  }
  await chooseMode(page, pair)
  // Number's orientation buttons show only on square grids.
  const turn = async () => { if (await page.isVisible('#rot_D_lb')) await page.click('#rot_D_lb') }
  await gestures(page, { beforeCtrl: pair.mode === 'number' ? turn : undefined })
}

function importsPerGenre () {
  const byGenre = new Map()
  for (const c of cases) {
    const genre = c.name.replace(/ \d+$/, '')
    const [w, h] = readSnapshot(c.name).grid_size
    byGenre.set(genre, [...byGenre.get(genre) ?? [], { ...c, cells: w * h }])
  }
  return [...byGenre].map(([genre, imports]) => ({ genre, imports: imports.sort((a, b) => a.cells - b.cells) }))
}

// The `#` part of a solve link to the board `build(page)` makes on a page of its own, since a new board keeps the last
// one's modes (`create_newboard`).
const solveLink = (browser, build) => withPage(browser, '', async (page) => {
  await build(page)
  return linkHash(await page.evaluate(solveLinkInPage))
})

function shownModesInPage () {
  return [...document.querySelectorAll('[id^="mo_"][id$="_lb"]')].filter((l) => l.offsetParent != null).map((l) => l.id.slice(3, -3))
}

async function tierB (browser) {
  const recordings = []
  for (const { genre, imports } of importsPerGenre()) {
    recordings.push({
      id: `genre/${slug(genre)}`,
      tier: 'B',
      boards: imports.map(({ name, url }) => async () => {
        let full = false
        const query = await solveLink(browser, async (p) => {
          await p.evaluate((u) => import_url(u), url)
          full = await p.evaluate(() => !pu.centerlist.some((c) => !pu.pu_q.number[c]))
        })
        return full ? null : { query, name }
      }),
      act: (p) => gestures(p)
    })
  }
  for (const [grid, size] of Object.entries(GRID_BOARDS)) {
    const query = await solveLink(browser, (p) => p.evaluate(newBoardInPage, { gridtype: grid === 'uniform' ? UNIFORM_TILING : grid, size }))
    const { context, page } = await openPenpa(browser, query)
    const modes = await settle(() => page.evaluate(shownModesInPage)).finally(() => context.close())
    for (const mode of modes) {
      recordings.push({ id: `grid/${grid}-${mode}`, tier: 'B', boards: [async () => ({ query })], act: (p) => inMode(p, { mode }) })
    }
  }
  return recordings
}

async function recordOnFirst (browser, { id, tier, boards, act }) {
  for (const board of boards) {
    const made = await board()
    if (!made) continue
    const { query, name } = made
    try {
      return await record(browser, query, act, name ? { tier, import: name } : { tier })
    } catch (e) {
      if (!(e instanceof NoBoot)) throw e
      console.log(`${id}: its board${name ? ` ${name}` : ''} did not boot: ${e.message.split('\n')[0]}`)
    }
  }
  throw new Error(`${id}: no board it could be recorded on booted`)
}

const prefixes = process.argv.slice(2)
const browser = await chromium.launch()
const refused = []
try {
  const all = [...await tierA(browser), ...await tierB(browser)]
  const ids = all.map(({ id }) => id)
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (twice.length) throw new Error(`two recordings would share the id ${twice.join(', ')}`)
  const plan = all.filter(({ id }) => !prefixes.length || prefixes.some((p) => id.startsWith(p)))
  for (const item of plan) {
    const { id } = item
    const started = Date.now()
    let made
    try {
      made = await recordOnFirst(browser, item)
    } catch (e) {
      refused.push(`${id}: could not be recorded: ${e.message.split('\n')[0]}`)
      console.log(`${id}: NOT RECORDED`)
      continue
    }
    const { text, recording } = made
    await writeRecording(id, text)
    const { checkpoints, report } = await replay(browser, recording, { id, fullRoundTrips: true })
    if (report) {
      refused.push(report)
      await rm(new URL(id + EXPECTED_SUFFIX, RECORDINGS), { force: true })
    } else {
      await writeExpected(id, checkpoints)
    }
    console.log(`${id}: ${recording.steps.length} steps, ${report ? 'REFUSED' : `${checkpoints.length} checkpoints`}, ${((Date.now() - started) / 1000).toFixed(1)} s`)
  }
} finally {
  await browser.close()
}
if (refused.length) {
  console.log(`\n${refused.length} refused:\n\n${refused.join('\n\n')}`)
  process.exitCode = 1
}

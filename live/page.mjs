import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { chromium } from 'playwright'
import { settle } from './settle.mjs'

const PENPA_URL = new URL('../docs/index.html', import.meta.url).href

const SOLVE_URL = new URL('../docs/solve.html', import.meta.url).href

export const PENPA_ORIGIN = 'https://penpa.test'

// The solve page's Penpa+ mark and the function that adds it, read from the shipped script so a test marks a link as the page does.
const solveForward = vm.runInNewContext(
  readFileSync(new URL('../docs/js/solve_forward.js', import.meta.url), 'utf8') + ';({ PENPA_MARK, withPenpaMark, penpaLinkParams })', { URLSearchParams })
export const PENPA_MARK = solveForward.PENPA_MARK

export const markedForPenpa = (query) => solveForward.penpaLinkParams(query).get('m') === 'solve' ? solveForward.withPenpaMark(query) : query

// `pu.maketext_solve()` after importing Akari 1 of `test/public/puzz_link_parser.js`, whose snapshot holds 13 numbers.
export const AKARI_SOLVE = '#m=solve&p=1VTtb7pIEP7uX9Hs124QBC2SNBff2qRpvXq1P68SY1BRUHQtL63BtH97Z3bxcNE2l7vchwvszOwzy+zMss9Er4kTulRT8dVNChoeQzP5qJg1PtTs6ftx4FoXtJHEHgvB8OJ4G1nl8jZJh+lQCfzNqrz9zVk5oV/WVHwVZaF4iq8slZUSKLGqGfoE124p/f3mhs6dIHLp3cuy2V413juNP8vVoa4/d+eXy3bveTkb/NJ6ql8O1W5gbh4e283g8jYdPniNN7fj1h4jNvUC15k56XBwtws2N+bCm2utO69lzp2NGr2a/fpbs3d9XbKzGkYlm2iEkgoMjYw+yZStJz75tAnPmlB9VNqnf1j7dGzZow+aPuemmZtP1p7oKrEMSnRNKF2oGleGIVSdq6pQNeEzxawuPq+Lz+sVoTAKxO9m8W1yQegVT1XsJAOwWgZgBwnAPGQANpcAzE0CMEsJwHzh+A5TzNvW8ikmZeRTqMPW8ylmeFgMdWnWHuQLl304SprqXLa5VLmscnnP13S4HHDZ4tLgssbXXOHPKJVsXVxb+an+/zC8nE9JOHemLlzPFltvWeTHLoErSSIWjCPhG7s7ZxoTS5Dn2CNhm2Q9cUMJChjbAknPRTi4JNBfbFjonnUh6M4W34VC15lQExbOCjm9O0Eg18J7kgRN/XAayFAMZD2eO2HI3iVk7cSeBEycGPpX5PlbOZK7KRxm7MgpitYgxc6P46NEdoQPuPcVamD/qFtpg6a3wKOjXkPTHjSQBytrOdhEbELgr1OyToLYn7KAwb4ZBgTgX1fA7OTmgPvRaglQU8HuZjaYL2CK4xrfC+TRstM+JZhAk3+NJlmzN6hAJIhzkRQAR6cEzRDKTWZslWRLNSRx4x+UAZEOZaApykDrTBlY3b8u4692XqigPvoQf0z9m31edOP/qHftMmaz8Ady584ifIbigP7A8iPvOfwbQh95i/gJezHZUwIDeobDgBZpDNApkwE8ITNg3/AZoxYpjVkVWY1bnRAbtzrm9uEijUoc+AI='

const pageErrors = []

export function takePageErrors () {
  return pageErrors.flatMap((errs) => errs.splice(0))
}

// Launches one Chromium before a file's tests and closes it after them, and fails any test during which a page
// it opened raised a page error or logged a `console.error`. The check is registered inside an `after` hook, which node
// runs last, so an error a test's own `t.after` hook (the context's close) raises is caught too; an `afterEach` runs before those.
// The hooks run with the file's other top-level hooks, so a test reads `browser()` in a `describe`'s hooks or tests,
// never in a top-level `before`.
export function useBrowser () {
  let browser
  before(async () => { browser = await chromium.launch() })
  beforeEach((t) => {
    t.after(() => {
      t.after(() => assert.deepEqual(takePageErrors(), [], 'no page error or console.error'))
    })
  })
  after(async () => { await browser?.close() })
  return () => browser
}

export function serveDocs (context, base) {
  const prefix = new URL(base).pathname.replace(/\/$/, '')
  return context.route(`${base.replace(/\/$/, '')}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).slice(prefix.length)
    return route.fulfill({ path: fileURLToPath(new URL('../docs' + (path === '/' ? '/index.html' : path), import.meta.url)) })
  })
}

export function jsRequest (file) {
  return new RegExp(`/js/${file.replace(/\./g, '\\.')}(\\?|$)`)
}

// Opens Penpa+ with `query` (such as `#m=solve&p=...`) in a context of its own and returns once `pu` exists.
// `cookies` (as `context.cookies()` returns them) start in the context; Chromium keeps no cookie for `file://`, so a
// cookie test passes `served: true` to be served `docs/` from `https://penpa.test/`, answered from this checkout.
// `url` opens that address (plus `query`) instead of the checkout's page, `solve: true` opens `solve.html` in place of the
// default page, `ready` is the page function that says the page is up (default: `pu` exists), and `setup(context)` runs
// before the page opens.
// `contextOptions` go to `browser.newContext`. solve.html's welcome dialog is closed on every page of the context as it shows,
// unless `welcome` is true. `dialogs` holds the message of every native dialog the page opened, each dismissed, and `errors` every page
// error and `console.error` so far.
export async function openPenpa (browser, query = '', { cookies = [], served = false, solve = false, url, ready = () => typeof pu !== 'undefined', setup, contextOptions, welcome = false } = {}) {
  const context = await penpaContext(browser, { served, setup, contextOptions })
  if (!welcome) context.on('page', closeWelcomeOnEveryLoad)
  if (cookies.length) await context.addCookies(cookies)
  const page = await context.newPage()
  const errors = []
  pageErrors.push(errors)
  onErrors(page, (e) => errors.push(e))
  const dialogs = []
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
  await page.goto((url ?? penpaAddress(served, solve)) + (solve ? query : markedForPenpa(query)))
  await page.waitForFunction(ready)
  if (solve && !welcome) await welcomeClosed(page)
  return { context, page, dialogs, errors }
}

// Waits until Penpa+ has loaded its saved settings; a setter saves only after that, and a read before it sees defaults.
export const waitForSettingsLoaded = (page) =>
  page.waitForFunction(() => typeof UserSettings !== 'undefined' && UserSettings._settingsLoaded)

// Opens one page that boots Penpa+ afresh for every link it loads, cheaper than a page of its own context for each:
// each load is a navigation, so the page's globals start over, and its storage and cookies start empty, as a new
// context's do. `served`, `setup` and `contextOptions` are `openPenpa`'s, but `setup` runs once, on the context, and any
// cookie or storage it leaves is cleared before each load like the rest. `load(query)` returns the page once `pu`
// exists and the errors raised since that load began; `close()` closes the page's context.
export async function openReloader (browser, { served = false, setup, contextOptions } = {}) {
  const context = await penpaContext(browser, { served, setup, contextOptions })
  await context.addInitScript(wipeStorageInPage)
  const page = await context.newPage()
  let errors = []
  onErrors(page, (e) => errors.push(e))
  return {
    async load (query) {
      // Penpa+ saves progress as it unloads, so the cookies are cleared once it has.
      await page.goto('about:blank')
      await context.clearCookies()
      errors = []
      pageErrors.push(errors)
      await page.goto(penpaAddress(served) + markedForPenpa(query))
      await page.waitForFunction(() => typeof pu !== 'undefined')
      return { page, errors }
    },
    close: () => context.close()
  }
}

// Runs in the page, before any of its scripts: empties the storage Penpa+ keeps between visits. `PenpaProgress` keeps a
// puzzle's progress in localforage's IndexedDB database (named `localforage` by default) and reads it back at boot, so
// a progress saved by the page before would load in place of the link. The delete is queued ahead of the page's own
// open of the database, which IndexedDB runs in order.
function wipeStorageInPage () {
  // The blank page between loads has no origin to keep storage for.
  if (location.protocol === 'about:') return
  localStorage.clear()
  sessionStorage.clear()
  indexedDB.deleteDatabase('localforage')
}

const welcomeCloseErrors = []
pageErrors.push(welcomeCloseErrors)

// Not an init script: a context with one loses kept card layouts over a reload under load (desk.live.mjs failed 21 of 36 runs, against 0 without one).
function closeWelcomeOnEveryLoad (page) {
  page.on('domcontentloaded', () => {
    if (!new URL(page.url()).pathname.endsWith('/solve.html')) return
    page.evaluate(closeWelcomeInPage).catch((e) => {
      // A page that navigated on or closed has no welcome left to close; its next load is handled by its own event.
      if (!page.isClosed() && !/Execution context was destroyed|Target .*closed/.test(e.message)) welcomeCloseErrors.push(`closing the welcome: ${e.message}`)
    })
  })
}

function closeWelcomeInPage () {
  const close = () => {
    const button = [...document.querySelectorAll('.ui-welcome wa-button')].find((node) => node.textContent === 'Start solving')
    // A wa-button presses its inner button, which exists once Lit has rendered it, a microtask after it is added.
    button?.updateComplete.then(() => button.click())
    return Boolean(button)
  }
  if (close()) return
  const watcher = new MutationObserver(() => { if (close()) watcher.disconnect() })
  watcher.observe(document.body, { childList: true, subtree: true })
}

async function penpaContext (browser, { served, setup, contextOptions }) {
  const context = await browser.newContext(contextOptions)
  await context.route(/^https?:\/\//, (route) => route.fulfill({ status: 200, body: '' }))
  if (served) {
    await serveDocs(context, PENPA_ORIGIN)
  }
  // Registered after the catch-all and `served`, so a test's own routes win.
  await setup?.(context)
  return context
}

function penpaAddress (served, solve = false) {
  if (served) return PENPA_ORIGIN + (solve ? '/solve.html' : '/')
  return solve ? SOLVE_URL : PENPA_URL
}

function onErrors (page, add) {
  page.on('pageerror', (e) => add(e?.stack || String(e)))
  page.on('console', (m) => { if (m.type() === 'error') add(`console.error: ${m.text()}`) })
}

export function shadeInPage (cell) {
  const { index, style = 1 } = typeof cell === 'number' ? { index: cell } : cell
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.set_surface(pu.centerlist[index], style)
  pu.redraw()
}

export const LAYOUT_KEY = 'chinstrap-solve-layout-v1'

export const THEME_KEY = 'chinstrap-solve-theme-v1'
// The localStorage key ui/welcome.js marks the welcome seen under. Its string is the old tour's, so a visitor who has seen the tour is not welcomed.
export const WELCOME_KEY = 'chinstrap-solve-tour-v1'
export const WELCOME_SEEN = 'seen'

export const GIVEN_CELL = 0
export const ANSWER_CELL = 1
export const SAME_ROW_CELL = 2

export const DIGIT_CELL = 12
export const MARK_CELL = 13
export const SHADED_CELL = 14

// Opens Penpa+ at `query` on a page of its own, returns what `act(page)` returns and closes the page's context.
export async function withPage (browser, query, act) {
  const { context, page } = await openPenpa(browser, query)
  try {
    return await act(page)
  } finally {
    await context.close()
  }
}

export const linkFromNewBoard = (browser, inPage, arg) => withPage(browser, '', (page) => page.evaluate(inPage, arg))

export const NURIKABE_IMPORT = 'https://puzz.link/p?nurikabe/v:/6/6/4j4p6h4p6j6'

export const solveLinkOfImport = (browser, url) => linkFromNewBoard(browser, async (u) => {
  await import_url(u)
  const solve = pu.maketext_solve()
  return solve.slice(solve.indexOf('#'))
}, url)

// A placeholder puzzle with long lorem ipsum rules and the tabs the layout tests measure, on a 10x10 board.
export const LONG_RULES_PUZZLE = {
  title: 'Long rules',
  author: '',
  rules: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna ' +
    'aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex.\n\nCommodo consequat duis aute ' +
    'irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur lorem ipsum dolor sit amet consectetur ' +
    'adipiscing elit sed do eiusmod tempor.\n\nUt labore et dolore magna aliqua enim ad minim.',
  tabs: ['Surface', 'Line Normal', 'Composite']
}

export function puzzleSolveLinkInPage ({ title, author, rules, tabs, size = 10, outsideClues = [] }) {
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  for (const side of [1, 2, 3, 4]) document.getElementById(`nb_space${side}`).value = outsideClues.length ? 1 : 0
  create_newboard()
  outsideClues.forEach((clue, i) => { pu.pu_q.number[pu.centerlist[i]] = [String(clue), 1, '1'] })
  document.getElementById('saveinfotitle').value = title
  document.getElementById('saveinfoauthor').value = author
  document.getElementById('saveinforules').value = rules
  UserSettings.tab_settings = tabs
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

export function buildNumberBoardInPage ({ given, answer }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.pu_q.number[pu.centerlist[given]] = [1, 1, '1']
  pu.pu_a.number[pu.centerlist[answer]] = [2, 2, '1']
}

function solveLinkInPage () {
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

export function typeDigitInPage ({ index, digit }) {
  pu.mode_set('number')
  pu.cursol = pu.centerlist[index]
  pu.selection = [pu.cursol]
  pu.key_number(digit)
  pu.redraw()
}

// Runs in the page: presses a save-dialog button's handler (`savetext_solve`, `savetext_clone`, ...) with link
// shortening off, which writes the link to the textarea at once, and returns the `#` part of what it wrote.
export function linkOfButtonInPage (handler) {
  UserSettings.shorten_links = false
  window[handler]()
  const url = document.getElementById('savetextarea').value
  return url.slice(url.indexOf('#'))
}

let numberLink
export async function makeNumberSolveLink (browser) {
  numberLink ??= await withPage(browser, '', async (page) => {
    await page.evaluate(buildNumberBoardInPage, { given: GIVEN_CELL, answer: ANSWER_CELL })
    return page.evaluate(solveLinkInPage)
  })
  return numberLink
}

// Runs in the page. The board's canvas in the Board card: the drawn one, since Penpa+ keeps a hidden pause canvas beside it.
export function boardCanvasInPage () {
  const canvases = [...document.querySelectorAll('section[aria-label="Board"] canvas')]
  return canvases.find((c) => c.getBoundingClientRect().width > 0)
}

export async function boardAgainstCard (page) {
  const boardCanvas = await page.evaluateHandle(boardCanvasInPage)
  try {
    return await boardCanvas.evaluate((canvasNode) => {
      const card = document.querySelector('section[aria-label="Board"]').getBoundingClientRect()
      const canvas = canvasNode.getBoundingClientRect()
      return { cardW: card.width, cardH: card.height, w: canvas.width, h: canvas.height, inside: canvas.left >= card.left - 1 && canvas.right <= card.right + 1 && canvas.top >= card.top - 1 && canvas.bottom <= card.bottom + 1 }
    })
  } finally {
    await boardCanvas.dispose()
  }
}

export const DESK_SIZE = { viewport: { width: 1400, height: 900 } }

export function newBoardSolveLinkInPage ({ names, rules, drawEdges } = {}) {
  document.getElementById('nb_size1').value = 6
  document.getElementById('nb_size2').value = 6
  create_newboard()
  if (names) UserSettings.tab_settings = names
  if (rules) document.getElementById('saveinforules').value = rules
  if (drawEdges) UserSettings.draw_edges = true
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

const newBoardLinks = new Map()

export function newBoardSolveLink (browser, names, rules, drawEdges) {
  const key = JSON.stringify([names ?? null, rules ?? null, drawEdges ?? null])
  if (!newBoardLinks.has(key)) newBoardLinks.set(key, linkFromNewBoard(browser, newBoardSolveLinkInPage, { names, rules, drawEdges }))
  return newBoardLinks.get(key)
}

export async function waitForDesk (page) {
  await page.getByRole('region', { name: 'Board' }).waitFor()
  await page.evaluate(() => engine.ready)
}

export async function openSolvePage (browser, query, options = {}) {
  const opened = await openPenpa(browser, query, { solve: true, contextOptions: DESK_SIZE, ...options })
  await waitForDesk(opened.page)
  return opened
}

// Waits out the first visit's welcome dialog, which the harness closes (`closeWelcomeInPage`): its closing animation would
// otherwise overlap the test's first steps. `solveWelcome` is set in the task that opens the dialog, so once it is there the
// dialog is already in the page, or never will be.
async function welcomeClosed (page) {
  // A page whose desk never builds has no welcome to wait for; the test's own wait for the desk then fails it.
  const built = await page.waitForFunction(() => window.solveWelcome !== undefined, undefined, { timeout: 10000 }).then(() => true, () => false)
  if (!built) return
  await page.waitForFunction(() => !document.querySelector('.ui-welcome'))
}

// Opens Settings and returns the open dialog. Its rows are the host's children, outside the shadow DOM's inner `dialog`
// that holds the role.
export async function openSettings (page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  return page.locator('wa-dialog[open]')
}

// Web Awesome's switch hides its input under the visible track, so Playwright's check for a covered target never passes on the
// input. The click goes to the switch element holding it, which waits for the dialog's opening animation to settle first.
export const flipSwitch = (page, name) => page.locator('wa-switch').filter({ has: page.getByRole('switch', { name }) }).click()

export async function closeSettings (page) {
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
}

// Opens Settings, flips the switch named `name` and closes the dialog.
export async function flipSettingsSwitch (page, name) {
  await openSettings(page)
  await flipSwitch(page, name)
  await closeSettings(page)
}

export async function resetLayoutInSettings (page) {
  const dialog = await openSettings(page)
  await dialog.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Reset layout' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
}

export const cellSize = (page) => page.evaluate(() => engine.getState().cellSize)

export const recentCard = (page) => page.getByRole('region', { name: 'Recent' })

// The cards the solver can close, in the Cards menu's order.
export const CLOSEABLE_CARDS = ['Rules', 'Mouse', 'Pinned', 'Mode', 'Recent']

export const cardsMenuItem = (page, name) => page.getByRole('menuitemcheckbox', { name, exact: true })

export async function openCardsMenu (page) {
  await page.getByRole('button', { name: 'Cards', exact: true }).click()
  await cardsMenuItem(page, CLOSEABLE_CARDS[0]).waitFor()
}

export async function closeCardsMenu (page) {
  await page.keyboard.press('Escape')
  await cardsMenuItem(page, CLOSEABLE_CARDS[0]).waitFor({ state: 'hidden' })
}

export async function toggleInCardsMenu (page, name) {
  await openCardsMenu(page)
  await cardsMenuItem(page, name).click()
  await closeCardsMenu(page)
}

export const cardBodyButtons = (page, name, options) => page.getByRole('region', { name }).locator('.ui-body').getByRole('button', options)

// A chip's text is its shortcut key (Z, X, C or V) and then the tool's name; a later chip has no key.
export const chipName = (text) => text.replace(/^[ZXCV]\s+/, '').trim()

export const currentTool = (page) => page.evaluate(() => engine.getTool())
export const listedTools = (page) => page.evaluate(() => engine.listTools().map(({ mode, submode }) => ({ mode, submode })))

// Splits a loop into one `it` per share so each gets its own `--test-timeout` and a failed check names its tool.
export const shareOf = (items, index, count) => items.filter((_, i) => i % count === index)

export const setTool = (page, tool) => page.evaluate((t) => engine.setTool(t), tool)

export async function waitForTool (page, want, message = 'the tool settles') {
  const tool = await settle(async () => {
    const { mode, submode } = await currentTool(page)
    return { mode, submode }
  }, want)
  assert.deepEqual(tool, want, message)
  return tool
}

// Two animation frames: the bridge's `change` fires in the first, and the UI has drawn it by the second. A ResizeObserver also runs in a frame, so this waits for a layout change the page reacts to.
export const afterChange = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

export const animationsDone = (page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))

// Fails on 5 or more engine changes in one idle second: a redraw that wakes the next change loops every frame, about 60 a second. Not zero, since Penpa+'s own clock (h1#timer) rewrites its text once a second.
export async function assertQuiet (page) {
  await afterChange(page)
  const changes = await page.evaluate(() => new Promise((resolve) => {
    let count = 0
    engine.on('change', () => { count += 1 })
    setTimeout(() => resolve(count), 1000)
  }))
  assert.ok(changes < 5, `${changes} engine changes in one idle second: a redraw keeps triggering the next`)
}

export const board = (page) => page.evaluate(() => {
  const state = readEngineState()
  // The undo and replay logs carry the time between keys, which differs between runs.
  const { command_undo: undo, command_redo: redo, command_replay: replay, ...entered } = state.pu_a
  return { entered, selection: state.selection, mode: state.mode }
})

export const storedEntries = (page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))

export const typedDigits = async (page) => Object.values((await board(page)).entered.number ?? {}).map(([digit]) => digit)

export function contrastHelpersInPage () {
  const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const parse = (css) => {
    const c = document.createElement('canvas').getContext('2d')
    c.clearRect(0, 0, 1, 1)
    c.fillStyle = css
    c.fillRect(0, 0, 1, 1)
    return [...c.getImageData(0, 0, 1, 1).data]
  }
  const over = (top, under) => {
    const a = top[3] / 255
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(255)
  }
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  return { luminance, parse, over, ratio }
}

export function opacityOfInPage (node) {
  let product = 1
  for (let n = node; n; n = n.assignedSlot ?? n.parentElement ?? n.getRootNode()?.host ?? null) {
    if (n.nodeType === 1) product *= Number(getComputedStyle(n).opacity)
  }
  return product
}

export function groundOfInPage (node, parse, over) {
  const layers = []
  for (let n = node; n; n = n.assignedSlot ?? n.parentElement ?? n.getRootNode()?.host ?? null) {
    if (n.nodeType !== 1) continue
    const bg = parse(getComputedStyle(n).backgroundColor)
    if (bg[3] > 0) layers.push(bg)
    if (bg[3] === 255) break
  }
  return layers.reduceRight((under, top) => over(top, under), [255, 255, 255, 255])
}

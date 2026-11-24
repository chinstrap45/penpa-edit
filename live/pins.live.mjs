// The pins and the Tab cycle of `solve.html` (#96): the engine reports the link's Tab set, the Pinned card seeds from it once
// per puzzle and keeps it across reloads, Tab, Shift+Tab, Enter and Z/X/C/V step or jump between pins, a pin remembers its
// style, and the board's frame tells the pins apart. The UI is found by role and accessible name, the board by what Penpa+
// would save (`readEngineState`, defined by recorder.js); the keys are real key presses.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, assertQuiet, cardBodyButtons, chipName, currentTool, newBoardSolveLink, openSolvePage, setTool, storedEntries, typedDigits, useBrowser, waitForDesk, waitForTool } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

const openSolve = async (tabSet) => openSolvePage(browser(), await newBoardSolveLink(browser(), tabSet))

const pinnedChips = (page) => cardBodyButtons(page, 'Pinned', { name: /^(?!Unpin|Save pins)/ })
const chipNames = async (page) => (await pinnedChips(page).allInnerTexts()).map(chipName)

// The colour of the board's frame, as the Board card draws it.
const frameColour = (page) => page.getByRole('region', { name: 'Board' }).evaluate((card) => getComputedStyle(card).outlineColor)

describe('engine.tabSet', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner', 'Surface', 'Special', 'Shape']) })
  after(async () => { await opened?.context.close() })

  it('lists the link\'s Tab set as modes and sub-modes', async () => {
    const set = await opened.page.evaluate(() => engine.tabSet())
    assert.deepEqual(set.slice(0, 3), [
      { mode: 'line', submode: '1' },
      { mode: 'sudoku', submode: '2' },
      { mode: 'surface', submode: null }
    ])
  })

  it('gives a mode that Penpa+ keeps a sub-mode for the sub-mode listed first', async () => {
    const [special, shape] = (await opened.page.evaluate(() => engine.tabSet())).slice(3)
    const listed = await opened.page.evaluate(() => engine.listTools())
    assert.equal(special.mode, 'special')
    assert.equal(shape.mode, 'symbol')
    for (const entry of [special, shape]) {
      assert.equal(listed.some((tool) => tool.mode === entry.mode && tool.submode === entry.submode), true, `${entry.mode} / ${entry.submode} is a listed tool`)
    }
  })
})

describe('the pins', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('seeds from the link\'s Tab set and survives a reload', async () => {
    const { page } = opened
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner']), ['Line > Normal', 'Sudoku > Corner'])
    await page.getByRole('button', { name: 'Unpin Line > Normal' }).click()
    assert.deepEqual(await settle(() => chipNames(page), ['Sudoku > Corner']), ['Sudoku > Corner'])
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipNames(page), ['Sudoku > Corner']), ['Sudoku > Corner'], 'a pin removed stays removed, so the Tab set seeds once')
  })

  // Penpa+'s history copy rewrites the link's `#` part on every save, with the solver's progress in it; the pins are the
  // puzzle's, so they hold across it.
  it('survive a reload of a link the history copy rewrote', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.getByRole('region', { name: 'Mode' }).getByRole('button', { name: 'Pin Line > Normal' }).click()
    const pinned = ['Sudoku > Corner', 'Line > Normal']
    assert.deepEqual(await settle(() => chipNames(page), pinned), pinned)
    await page.evaluate(() => engine.setSetting('auto_save_history', true))
    const before = await page.evaluate(() => location.hash)
    await page.evaluate(() => PenpaProgress.save())
    assert.notEqual(await page.evaluate(() => location.hash), before, 'the save rewrote the link')
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipNames(page), pinned), pinned)
  })
})

describe('a saved value the Pinned card did not write', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  // Each is short of what the card writes: a mode, a list of pins.
  const BAD_VALUES = [
    { pins: [{ submode: '1', style: null }] },
    { pins: [{ mode: 5, submode: '1', style: null }] },
    { pins: 'line' }
  ]
  const savedPinKey = (page) => page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((key) => localStorage.getItem(key).includes('"pins"'))
    if (keys.length !== 1) throw new Error(`expected one saved pin set, found ${keys.length}`)
    return keys[0]
  })

  const savedPins = async (page) => {
    const key = await savedPinKey(page)
    return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key)
  }
  const assertSavedShape = (saved) => {
    assert.deepEqual(Object.keys(saved).sort(), ['colours', 'pins'])
    assert.deepEqual(saved.pins.flatMap((p) => Object.keys(p)).filter((k) => !['mode', 'submode', 'style'].includes(k)), [])
  }

  it('is saved with no id or nextId', async () => {
    assertSavedShape(await savedPins(opened.page))
  })

  for (const value of BAD_VALUES) {
    it(`is read as none, so the Tab set seeds again, and the console says so: ${JSON.stringify(value)}`, async () => {
      const { page } = opened
      const seeded = ['Line > Normal', 'Sudoku > Corner']
      assert.deepEqual(await settle(() => chipNames(page), seeded), seeded)
      const key = await savedPinKey(page)
      await page.evaluate(([k, saved]) => localStorage.setItem(k, JSON.stringify(saved)), [key, value])
      const warnings = []
      const onConsole = (m) => { if (m.type() === 'warning') warnings.push(m.text()) }
      page.on('console', onConsole)
      try {
        await page.reload()
        await waitForDesk(page)
        assert.deepEqual(await settle(() => chipNames(page), seeded), seeded)
        assert.equal(warnings.some((w) => /does not hold pins/.test(w)), true, `a warning names the replaced value: ${warnings}`)
      } finally {
        page.off('console', onConsole)
      }
    })
  }

  it('still loads a save that holds id and nextId, with the same pins, and saves them again without either', async () => {
    const { page } = opened
    const key = await savedPinKey(page)
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ nextId: 7, pins: [{ id: 3, mode: 'line', submode: '1', style: null }] })), key)
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal']), ['Line > Normal'])
    assertSavedShape(await savedPins(page))
  })
})

// Pins outside Sudoku, so no Shift starts a hold; holds.live.mjs covers Tab during a hold.
describe('Tab, Shift+Tab and Enter', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Surface']) })
  after(async () => { await opened?.context.close() })

  it('steps forward, back and around the pins', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'surface', submode: null }, 'Tab lands on pin 2')
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, { mode: 'line', submode: '1' }, 'Shift+Tab lands on pin 1')
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, { mode: 'surface', submode: null }, 'Shift+Tab wraps back to the last pin')
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '1' }, 'Tab wraps to pin 1')
  })

  it('does the same on Enter, unless a button has focus', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('Enter')
    await waitForTool(page, { mode: 'surface', submode: null })
    await page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: 'Unpin Surface' }).focus()
    await page.keyboard.press('Enter')
    // The focused button took the Enter: it unpinned, and the tool did not step.
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal']), ['Line > Normal'])
    assert.deepEqual(await currentTool(page).then(({ mode, submode }) => ({ mode, submode })), { mode: 'surface', submode: null })
  })
})

describe('the mouse wheel on the page', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Surface', 'Special', 'Shape']) })
  after(async () => { await opened?.context.close() })

  const BOARD_BODY = 'section[aria-label="Board"] .ui-body'
  const modeNow = async (page) => (await currentTool(page)).mode
  const toLine = (page) => setTool(page, { mode: 'line', submode: '1' })
  const overCentre = async (page, selector) => {
    const box = await page.locator(selector).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  }
  // Sends `deltas` as wheel events in one go, so they land in one swipe whatever the box's load; resolves to each event's `defaultPrevented`.
  const wheelBurst = (page, deltas, init = {}) => page.evaluate(({ selector, deltas: list, init: extra }) => {
    const body = document.querySelector(selector)
    return list.map((deltaY) => {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...extra })
      body.dispatchEvent(event)
      return event.defaultPrevented
    })
  }, { selector: BOARD_BODY, deltas, init })
  // Waits out the page's swipe gap (a sleep, allowed because the gap is the page's own clock), so the last test's swipe is not this one's.
  const freshSwipe = (page) => page.waitForTimeout(350)
  // Records every wheel event's `defaultPrevented` from now, read after every handler has run; `true` means the page's own scrolling was stopped.
  const watchPrevented = (page) => page.evaluate(() => {
    const first = window.wheelPrevented === undefined
    window.wheelPrevented = []
    if (first) document.addEventListener('wheel', (e) => window.wheelPrevented.push(e.defaultPrevented), { passive: true })
  })

  it('steps once per notch, down as Tab and up as Shift+Tab, and keeps the page from scrolling', async () => {
    const { page } = opened
    await watchPrevented(page)
    await toLine(page)
    await overCentre(page, BOARD_BODY)
    await page.mouse.wheel(0, 100)
    await waitForTool(page, { mode: 'surface', submode: null }, 'a notch down is Tab')
    await page.mouse.wheel(0, 100)
    assert.equal(await settle(() => modeNow(page), 'special'), 'special', 'a second notch steps again')
    await page.mouse.wheel(0, -100)
    await waitForTool(page, { mode: 'surface', submode: null }, 'a notch up is Shift+Tab')
    await page.mouse.wheel(0, -100)
    await waitForTool(page, { mode: 'line', submode: '1' }, 'up again, back to pin 1')
    await page.mouse.wheel(0, -100)
    assert.equal(await settle(() => modeNow(page), 'symbol'), 'symbol', 'up from the first pin wraps to the last')
    assert.deepEqual(await page.evaluate(() => window.wheelPrevented), [true, true, true, true, true])
  })

  it('counts a notch of 120, or of 3 lines, as one step and carries nothing over', async () => {
    const { page } = opened
    await freshSwipe(page)
    await toLine(page)
    await wheelBurst(page, [120, 120, 120, 120, 120])
    // Five steps from Line round four pins to Surface; a carried 20 per notch would make a sixth, Special.
    await waitForTool(page, { mode: 'surface', submode: null }, 'five notches of 120 are five steps')
    await toLine(page)
    await wheelBurst(page, [3], { deltaMode: 1 })
    await waitForTool(page, { mode: 'surface', submode: null }, '3 lines are a notch')
  })

  it('adds up a trackpad\'s small deltas: 60 of 100 px is no step, 100 is one', async () => {
    const { page } = opened
    await freshSwipe(page)
    await toLine(page)
    await wheelBurst(page, [10, 10, 10, 10, 10, 10])
    assert.equal(await modeNow(page), 'line', '60 of 100 px is no step')
    await wheelBurst(page, [10, 10, 10, 10])
    await waitForTool(page, { mode: 'surface', submode: null }, '100 px in all is one step')
  })

  it('moves one swipe at most three steps', async () => {
    const { page } = opened
    await freshSwipe(page)
    await toLine(page)
    await wheelBurst(page, Array(60).fill(10))
    await waitForTool(page, { mode: 'symbol', submode: 'circle_L' }, '600 px of small deltas in one swipe are three steps, not six')
  })

  it('starts a new sum when the direction changes', async () => {
    const { page } = opened
    await freshSwipe(page)
    await toLine(page)
    await wheelBurst(page, [60, -50, -50])
    // Without the reset the sum is 60 - 100 = -40 and nothing steps; with it, -100 is one step up from Line to Shape.
    await waitForTool(page, { mode: 'symbol', submode: 'circle_L' }, '-100 after the turn is one step up')
  })

  it('forgets a leftover after a pause', async () => {
    const { page } = opened
    await toLine(page)
    await wheelBurst(page, [60])
    // A sleep, allowed for a "nothing happened" check: the swipe gap is 300 ms of the clock.
    await page.waitForTimeout(400)
    await wheelBurst(page, [60])
    await afterChange(page)
    assert.equal(await modeNow(page), 'line', '60 and 60 a pause apart are no step')
  })

  it('leaves Ctrl+wheel alone', async () => {
    const { page } = opened
    await toLine(page)
    assert.deepEqual(await wheelBurst(page, [100], { ctrlKey: true }), [false])
    await afterChange(page)
    assert.equal(await modeNow(page), 'line', 'a pinch zoom is not a step')
  })

  it('steps over a card that is not the board when it has no scroll bar, and keeps the page from scrolling', async () => {
    const { page } = opened
    await freshSwipe(page)
    await watchPrevented(page)
    await toLine(page)
    const body = page.locator('section[aria-label="Rules"] .ui-body')
    assert.equal(await body.evaluate((node) => node.scrollHeight > node.clientHeight), false, 'the short rules fit their card')
    await overCentre(page, 'section[aria-label="Rules"] .ui-body')
    await page.mouse.wheel(0, 100)
    await waitForTool(page, { mode: 'surface', submode: null }, 'a notch over the Rules card is Tab')
    assert.deepEqual(await page.evaluate(() => window.wheelPrevented), [true])
  })

  it('steps over the page outside every card', async () => {
    const { page } = opened
    await freshSwipe(page)
    await toLine(page)
    await page.mouse.move(2, 2)
    await page.mouse.wheel(0, 100)
    await waitForTool(page, { mode: 'surface', submode: null }, 'a notch over the bare desk is Tab')
  })

  it('does not step while a dialog is open', async () => {
    const { page } = opened
    await freshSwipe(page)
    await toLine(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.locator('wa-dialog[open]').waitFor({ state: 'attached' })
    await overCentre(page, 'section[aria-label="Pinned"] .ui-body')
    await page.mouse.wheel(0, 100)
    await afterChange(page)
    assert.equal(await modeNow(page), 'line', 'a notch with a dialog open is no step')
    await page.keyboard.press('Escape')
    await page.locator('wa-dialog[open]').waitFor({ state: 'detached' })
  })
})

describe('the mouse wheel over a zoomed board', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Surface']) })
  after(async () => { await opened?.context.close() })

  it('scrolls the board and changes no pin once the board overflows its card', async () => {
    const { page } = opened
    const body = page.locator('section[aria-label="Board"] .ui-body')
    for (let i = 0; i < 12; i += 1) await page.getByRole('region', { name: 'Board' }).getByRole('button', { name: 'Zoom in' }).click()
    assert.equal(await settle(() => body.evaluate((node) => node.scrollHeight > node.clientHeight), true), true, 'the zoomed board overflows')
    await setTool(page, { mode: 'line', submode: '1' })
    const box = await body.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 100)
    assert.equal(await settle(() => body.evaluate((node) => node.scrollTop > 0), true), true, 'the board scrolled')
    assert.equal((await currentTool(page)).mode, 'line')
  })
})

describe('the mouse wheel over the Rules card', () => {
  let opened
  before(async () => {
    const rules = Array.from({ length: 80 }, (_, i) => `Rule line ${i + 1}.`).join('\n')
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal', 'Surface'], rules))
  })
  after(async () => { await opened?.context.close() })

  it('scrolls the card and changes no pin', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    const body = page.locator('section[aria-label="Rules"] .ui-body')
    assert.equal(await body.evaluate((node) => node.scrollHeight > node.clientHeight), true, 'the long rules overflow the card')
    const box = await body.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 100)
    assert.equal(await settle(() => body.evaluate((node) => node.scrollTop > 0), true), true, 'the card scrolled')
    assert.equal((await currentTool(page)).mode, 'line')
  })

  it('is still the page\'s at the end of the scroll', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    const body = page.locator('section[aria-label="Rules"] .ui-body')
    await body.evaluate((node) => { node.scrollTop = node.scrollHeight })
    const box = await body.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.evaluate(() => {
      window.wheelPrevented = []
      document.addEventListener('wheel', (e) => window.wheelPrevented.push(e.defaultPrevented), { passive: true })
    })
    await page.mouse.wheel(0, 100)
    await afterChange(page)
    assert.equal(await body.evaluate((node) => node.scrollTop + node.clientHeight >= node.scrollHeight - 1), true, 'the card is at its end')
    assert.equal((await currentTool(page)).mode, 'line', 'a notch at the end of the scroll is no step')
    assert.deepEqual(await page.evaluate(() => window.wheelPrevented), [false])
  })
})

describe('the mouse wheel with nothing pinned', () => {
  let opened
  before(async () => { opened = await openSolve([]) })
  after(async () => { await opened?.context.close() })

  it('is left to the page', async () => {
    const { page } = opened
    assert.deepEqual(await chipNames(page), [], 'no pin')
    const outcome = await page.evaluate(() => {
      const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
      document.querySelector('section[aria-label="Board"] .ui-body').dispatchEvent(event)
      return event.defaultPrevented
    })
    assert.equal(outcome, false)
  })
})

describe('Z, X, C and V', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Line Normal', 'Wall', 'Number Normal']) })
  after(async () => { await opened?.context.close() })

  it('types Z in Number mode', async () => {
    const { page } = opened
    await setTool(page, { mode: 'number', submode: '1' })
    await clickCell(page, CELL)
    await page.keyboard.press('z')
    assert.deepEqual(await settle(() => typedDigits(page), ['z']), ['z'])
    assert.equal((await currentTool(page)).mode, 'number')
  })

  it('jumps to pins 1 to 4 from Line mode', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('z')
    await waitForTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.press('x')
    await waitForTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('c')
    await waitForTool(page, { mode: 'wall', submode: null })
    await page.keyboard.press('v')
    await waitForTool(page, { mode: 'number', submode: '1' })
  })

  it('types the letter with Caps Lock on, and does not jump', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    // An upper-case letter without Shift is how a keyboard with Caps Lock on sends it, and how Penpa+ tells.
    await page.keyboard.press('Z')
    assert.equal((await currentTool(page)).mode, 'line')
    await setTool(page, { mode: 'number', submode: '1' })
    await clickCell(page, CELL)
    await page.keyboard.press('Z')
    assert.deepEqual(await settle(() => typedDigits(page), ['Z']), ['Z'])
  })

  it('ends a held Shift on a jump, so the next Shift hold still lends Corner', async () => {
    const { page } = opened
    const held = () => page.evaluate(() => engine.getState().held)
    await setTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.down('Shift')
    try {
      await waitForTool(page, { mode: 'sudoku', submode: '2' })
      await page.keyboard.press('KeyX')
      await waitForTool(page, { mode: 'line', submode: '1' }, 'Shift+X jumps to pin 2')
      assert.equal(await settle(held, false), false, 'the hold ended')
    } finally {
      await page.keyboard.up('Shift')
    }
    await setTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.down('Shift')
    try {
      await waitForTool(page, { mode: 'sudoku', submode: '2' }, 'the next hold lends Corner')
      assert.equal(await settle(held, true), true)
    } finally {
      await page.keyboard.up('Shift')
    }
    await waitForTool(page, { mode: 'sudoku', submode: '1' }, 'and its key-up gives Normal back')
  })

  it('does not jump when Penpa+\'s shortcuts setting is off', async () => {
    const { page } = opened
    await page.evaluate(() => { UserSettings.shortcuts_enabled = false })
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('z')
    assert.equal((await currentTool(page)).mode, 'line')
  })
})

describe('what a pin remembers', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Line Diagonal', 'Number Normal']) })
  after(async () => { await opened?.context.close() })

  const styleButton = (name) => opened.page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Style' }).getByRole('button', { name })

  it('returns a pin with the last style used on it, though another pin of the mode used another', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await styleButton('red').click()
    await settle(async () => (await currentTool(page)).style, 8)
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '2' })
    await styleButton('blue').click()
    await settle(async () => (await currentTool(page)).style, 9)
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, { mode: 'line', submode: '1' })
    assert.equal((await currentTool(page)).style, 8, 'pin 1 is red again')
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '2' })
    assert.equal((await currentTool(page)).style, 9, 'pin 2 is blue again')
  })

  it('returns a pin with its style when the Mode card lands on it', async () => {
    const { page } = opened
    // From pin 2, blue: Penpa+ keeps one style for all of Line, so the pick alone would come back blue.
    assert.equal((await currentTool(page)).style, 9)
    await page.getByRole('combobox', { name: 'Tool' }).fill('Drag through cell centres.')
    await page.locator('[role=treeitem][data-mode=line][data-submode="1"]').click()
    await waitForTool(page, { mode: 'line', submode: '1' })
    assert.equal(await settle(async () => (await currentTool(page)).style, 8), 8, 'pin 1 is red again')
    const saved = await page.evaluate(() => window.pinBoard.snapshot())
    assert.equal(saved.find((pin) => pin.mode === 'line' && pin.submode === '1').style, 8, 'and still remembers red')
  })

  it('leaves every pin unchanged when a tool outside the pins is picked in the Mode card', async () => {
    const { page } = opened
    const before = await storedEntries(page)
    const chipsBefore = await chipNames(page)
    const combobox = page.getByRole('combobox', { name: 'Tool' })
    await combobox.fill('Line helper')
    await page.locator('[role=treeitem][data-mode="line"][data-submode="4"]').click()
    await waitForTool(page, { mode: 'line', submode: '4' })
    assert.deepEqual(await chipNames(page), chipsBefore)
    assert.equal(await storedEntries(page), before, 'nothing of the pins was saved again')
  })
})

describe('the board frame', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal']) })
  after(async () => { await opened?.context.close() })

  // The frame takes the current pin's colour whatever the style (#243); the first listed tool, Surface, has colour styles.
  const threeTools = (page) => page.evaluate(() => engine.listTools().slice(0, 3).map(({ mode, submode }) => ({ mode, submode })))

  // The Pinned card marks the current pin's chip in the same draw that colours the frame.
  const pressedChip = (page) => page.getByRole('region', { name: 'Pinned' }).locator('[aria-pressed="true"]').allInnerTexts()
    .then((texts) => texts.map(chipName))
  const frameOnce = async (page, chips) => {
    assert.deepEqual(await settle(() => pressedChip(page), chips), chips)
    return frameColour(page)
  }

  it('gives two pins different colours, and a tool outside the pins its own', async () => {
    const { page } = opened
    const [one, two, other] = await threeTools(page)
    await page.evaluate((entries) => window.pinBoard.replace(entries), [one, two].map((t) => ({ ...t, style: null })))
    await setTool(page, one)
    const nameOf = (tool) => page.evaluate((t) => window.toolGuide.chipLabel(engine.listTools().find((x) => x.mode === t.mode && x.submode === t.submode)), tool)
    const first = await frameOnce(page, [await nameOf(one)])
    await setTool(page, two)
    const second = await frameOnce(page, [await nameOf(two)])
    assert.notEqual(second, first, 'two pins differ')
    await setTool(page, other)
    const neutral = await frameOnce(page, [])
    assert.notEqual(neutral, first)
    assert.notEqual(neutral, second)
  })
})

describe('the pin toggles', () => {
  let opened
  before(async () => {
    opened = await openSolve(['Line Normal', 'Sudoku Corner', 'Surface', 'Wall'])
    for (const name of ['Unpin Surface', 'Unpin Wall']) {
      await opened.page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name }).click()
    }
  })
  after(async () => { await opened?.context.close() })

  const modeCard = (page) => page.getByRole('region', { name: 'Mode' })
  const recentCard = (page) => page.getByRole('region', { name: 'Recent' })

  it('has no Pin current tool button', async () => {
    assert.equal(await opened.page.getByRole('button', { name: 'Pin current tool' }).count(), 0)
  })

  it('leaves the engine quiet while nobody touches the page', async () => {
    await assertQuiet(opened.page)
  })

  it('shows the Mode card\'s pin pressed exactly when the current tool is pinned, and toggles it', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await modeCard(page).getByRole('button', { name: 'Unpin Line > Normal' }).waitFor()
    assert.equal(await modeCard(page).getByRole('button', { name: 'Unpin Line > Normal' }).getAttribute('aria-pressed'), 'true')
    await setTool(page, { mode: 'surface', submode: null })
    const pin = modeCard(page).getByRole('button', { name: 'Pin Surface' })
    await pin.waitFor()
    assert.equal(await pin.getAttribute('aria-pressed'), 'false')
    await pin.click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner', 'Surface']), ['Line > Normal', 'Sudoku > Corner', 'Surface'])
    assert.equal(await modeCard(page).getByRole('button', { name: 'Unpin Surface' }).getAttribute('aria-pressed'), 'true')
    // The Tab cycle follows: Surface is the last pin, so Tab from it wraps to the first.
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '1' })
    await setTool(page, { mode: 'surface', submode: null })
    await waitForTool(page, { mode: 'surface', submode: null })
    await modeCard(page).getByRole('button', { name: 'Unpin Surface' }).click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner']), ['Line > Normal', 'Sudoku > Corner'])
    assert.equal(await modeCard(page).getByRole('button', { name: 'Pin Surface' }).getAttribute('aria-pressed'), 'false')
  })

  it('gives each Recent chip a pin that pins its tool and leaves the current tool alone', async () => {
    const { page } = opened
    await setTool(page, { mode: 'wall', submode: null })
    await afterChange(page)
    await setTool(page, { mode: 'surface', submode: null })
    await waitForTool(page, { mode: 'surface', submode: null })
    const wall = recentCard(page).getByRole('button', { name: 'Pin Wall' })
    await wall.waitFor()
    assert.equal(await wall.getAttribute('aria-pressed'), 'false')
    await wall.click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner', 'Wall']), ['Line > Normal', 'Sudoku > Corner', 'Wall'])
    // A pinned mode leaves Recent (#182).
    assert.equal(await recentCard(page).getByRole('button', { name: /Wall/ }).count(), 0)
    assert.equal((await currentTool(page)).mode, 'surface', 'the tool did not change')
    await page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: 'Unpin Wall' }).click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner']), ['Line > Normal', 'Sudoku > Corner'])
    assert.equal((await currentTool(page)).mode, 'surface')
  })
})

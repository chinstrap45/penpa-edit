// The solve page's welcome dialog (#408, GLOSSARY.md **Welcome**): one dialog on a first visit, no stops, no dimmed
// page. Escape or Start solving closes it, and after either it does not show again, across reloads, until Settings
// replays it. It is found by role and name, as a solver sees it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { settle } from './settle.mjs'
import { afterChange, DIGIT_CELL, makeNumberSolveLink, openSolvePage, setTool, typedDigits, useBrowser, waitForDesk, WELCOME_KEY, WELCOME_SEEN } from './page.mjs'
import { clickCell } from './replay.mjs'

const browser = useBrowser()

const welcome = (page) => page.getByRole('dialog', { name: 'Welcome to ChinStrap' })
// The dialog's own element, which holds its slotted text and buttons; the role above is its inner <dialog>, in a shadow root.
const welcomeBox = (page) => page.locator('wa-dialog.ui-welcome')
const startButton = (page) => welcomeBox(page).getByRole('button', { name: 'Start solving', exact: true })
const openFirstVisit = async () => openSolvePage(browser(), await makeNumberSolveLink(browser()), { welcome: true })
const storedWelcome = (page) => page.evaluate((key) => localStorage.getItem(key), WELCOME_KEY)

// The dialog is up once the desk is built, so after two frames past that a dialog that is not there is not coming.
async function welcomeShownAfterLoad (page) {
  await waitForDesk(page)
  await afterChange(page)
  return welcomeBox(page).count()
}

// Presses Settings' Show the welcome, and waits for the dialog to show and Settings to close.
async function replayFromSettings (page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await page.locator('wa-dialog[open]').getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Show the welcome' }).click()
  await welcome(page).waitFor()
  await settings.waitFor({ state: 'hidden' })
}

describe('the welcome dialog on a first visit', () => {
  it('says what differs from Penpa+, in the approved words, with no stops and no dimmed page', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await welcome(page).waitFor()
      const lines = await welcomeBox(page).locator('li').allTextContents()
      assert.deepEqual(lines.map((line) => line.trim()), [
        'Drag a card by its title, resize it from any edge, close it with ×. Your layout is kept.',
        'Pin tools in Pinned. Z X C V pick the first four; Tab, Shift+Tab or the mouse wheel over the board steps through them. Recent keeps your last tools.',
        'Mode lists every tool this grid has.',
        'Try starts a trial. Keep or Discard it later.',
        'Penpa+ opens this puzzle in Penpa+; its Back to new UI button brings you back.'
      ])
      assert.match(await welcomeBox(page).textContent(), /What's different from Penpa\+:/)
      assert.equal(await startButton(page).count(), 1)
      assert.equal(await page.locator('.ui-tour, .ui-tour-veil, .ui-tour-spotlight').count(), 0, 'no stop, veil or spotlight')
    } finally {
      await context.close()
    }
  })

  it('is marked seen as it opens, so a reload does not bring it back', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await welcome(page).waitFor()
      assert.equal(await storedWelcome(page), WELCOME_SEEN)
      await page.reload()
      assert.equal(await welcomeShownAfterLoad(page), 0, 'the welcome shows on the first visit only')
    } finally {
      await context.close()
    }
  })

  it('Start solving closes it for good', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await startButton(page).click()
      await welcomeBox(page).waitFor({ state: 'detached' })
      await page.reload()
      assert.equal(await welcomeShownAfterLoad(page), 0)
    } finally {
      await context.close()
    }
  })

  it('Escape closes it and does not reach the board: the selection stays, and a digit typed while it is up is not entered', async () => {
    const { context, page } = await openFirstVisit()
    try {
      await welcome(page).waitFor()
      await page.keyboard.press('Escape')
      await welcomeBox(page).waitFor({ state: 'detached' })

      // With the Number tool, a selected cell is where a digit would go. Select it, replay, and press Escape on the dialog.
      await setTool(page, { mode: 'number', submode: '1' })
      await clickCell(page, DIGIT_CELL)
      await replayFromSettings(page)
      await page.keyboard.press('1')
      await page.keyboard.press('Escape')
      await welcomeBox(page).waitFor({ state: 'detached' })
      assert.deepEqual(await typedDigits(page), [], 'the board took no digit while the dialog was up')
      await page.keyboard.press('1')
      assert.deepEqual(await settle(() => typedDigits(page), ['1']), ['1'], 'with the dialog gone the same key enters it on the still-selected cell')
    } finally {
      await context.close()
    }
  })
})

describe('Settings', () => {
  it('replays the welcome for a visitor who has seen it', async () => {
    const { context, page } = await openSolvePage(browser(), await makeNumberSolveLink(browser()))
    try {
      // The harness closed the first visit's welcome; a visitor who has seen it is not shown it again.
      await welcomeBox(page).waitFor({ state: 'detached' })
      await page.reload()
      assert.equal(await welcomeShownAfterLoad(page), 0, 'a visitor who has seen it is not shown it')
      await replayFromSettings(page)
      await page.keyboard.press('Escape')
      await welcomeBox(page).waitFor({ state: 'detached' })
    } finally {
      await context.close()
    }
  })
})

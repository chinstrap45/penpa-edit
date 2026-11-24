// The solve page credits Penpa+: the top bar's Penpa+ text button (the one mention there) and an About group at the
// bottom of Settings with Penpa+'s MIT lines and this fork's repository, both read at 1366x768 in both themes.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openSolvePage, useBrowser, openSettings } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const LAPTOP = { width: 1366, height: 768 }
const PENPA_URL = 'https://github.com/swaroopg92/penpa-edit'
const PENPA_LICENCE_URL = `${PENPA_URL}/blob/master/LICENSE`
const FORK_URL = 'https://github.com/chinstrap45/penpa-edit'
const FORK_LINK_TEXT = 'chinstrap45/penpa-edit'
// Shift+Tab presses from a freshly opened dialog that are enough to leave it, whatever holds focus first.
const FIRST_TAB_STOPS_TO_LEAVE = 4

async function open (theme) {
  const opened = await openSolvePage(browser(), AKARI_SOLVE, { served: true, contextOptions: { viewport: LAPTOP } })
  await opened.page.evaluate((t) => engine.setTheme(t), theme)
  await settle(() => opened.page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
  return opened
}

function barBoxes () {
  const bar = document.querySelector('.ui-bar')
  const heading = bar.querySelector('.ui-heading')
  const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
  const controls = [...bar.children].filter((n) => n !== heading && !n.matches('.ui-spacer') && n.offsetWidth > 0)
  return {
    title: rect(heading.querySelector('.ui-title')),
    controls: controls.map((node) => ({ ...rect(node), text: node.textContent.trim() })),
    compact: bar.classList.contains('is-compact'),
    headingLeft: bar.classList.contains('is-heading-left')
  }
}

describe('the top bar at 1366x768', () => {
  for (const theme of ['light', 'dark']) {
    it(`names Penpa+ once, in its text button, with the title centred and no control cut or crowded in the ${theme} theme`, async (t) => {
      const { context, page } = await open(theme)
      t.after(() => context.close())
      const bar = page.locator('.ui-bar')
      assert.equal(await bar.getByText('Penpa+', { exact: true }).count(), 1, 'one visible mention of Penpa+')
      assert.equal(await bar.getByRole('link').count(), 0, 'and no credit link')
      const boxes = await page.evaluate(barBoxes)
      assert.equal(boxes.headingLeft, false, 'the title stays centred')
      assert.equal(boxes.compact, false, 'no button shrinks')
      for (const control of boxes.controls) {
        assert.equal(boxes.title.right <= control.left || boxes.title.left >= control.right, true, `the title clears ${control.text || 'a button'}: ${JSON.stringify([boxes.title, control])}`)
      }
    })
  }
})

describe('the About group in Settings', () => {
  it('is the last group, and names Penpa+ and its author, the engine, the MIT lines, and both repositories', async (t) => {
    const { context, page } = await open('light')
    t.after(() => context.close())
    const dialog = await openSettings(page)
    const about = dialog.getByRole('group', { name: 'About' })
    assert.equal(await dialog.locator('fieldset > legend').last().textContent(), 'About', 'About is the last group')
    const text = await about.textContent()
    assert.match(text, /solving-focused UI fork of Penpa\+ by swaroopg92/)
    assert.match(text, /puzzle engine is Penpa\+'s/)
    assert.match(text, /Original Work\/Project Initiator - Copyright \(c\) 2019 Opt-Pan/)
    assert.match(text, /New Features\/Upgrades - Copyright \(c\) 2020 Swaroop Guggilam/)
    const links = await about.getByRole('link').evaluateAll((nodes) => nodes.map((n) => [n.href, n.target]))
    assert.deepEqual(links, [[PENPA_URL, '_blank'], [PENPA_LICENCE_URL, '_blank'], [FORK_URL, '_blank']])
  })

  it('ends the groups with Page, Pins and About', async (t) => {
    const { context, page } = await open('light')
    t.after(() => context.close())
    await openSettings(page)
    const legends = await page.locator('wa-dialog[open] fieldset > legend').allTextContents()
    assert.deepEqual(legends.slice(-3), ['Page', 'Pins', 'About'])
  })

  it('says "desk" nowhere a solver reads it: not in Settings, not in a tooltip', async (t) => {
    const { context, page } = await open('light')
    t.after(() => context.close())
    const dialog = await openSettings(page)
    const inPage = await dialog.getByRole('group', { name: 'Page' }).getByRole('switch', { name: 'Show board coordinates' }).count()
    assert.equal(inPage, 1, 'Show board coordinates is in the Page group')
    // The words a control shows are text and attributes alike: Web Awesome's select takes its label and placeholder as attributes.
    const shown = await page.evaluate(() => [...document.querySelectorAll('wa-dialog[open] *, wa-tooltip')]
      .flatMap((node) => [node.textContent, ...['label', 'placeholder', 'hint', 'help-text', 'aria-label', 'title'].map((name) => node.getAttribute(name))])
      .join('\n'))
    assert.doesNotMatch(shown, /\bdesk\b/i)
  })

  it('brings Shift+Tab that leaves the dialog back inside it, reaching an About link', async (t) => {
    const { context, page } = await open('light')
    t.after(() => context.close())
    await openSettings(page)
    // A press that leaves the dialog is answered in a timeout, which the next macrotask of the page follows.
    const afterTimeouts = () => page.evaluate(() => new Promise((resolve) => setTimeout(resolve)))
    const reached = []
    for (let press = 0; press < FIRST_TAB_STOPS_TO_LEAVE && !reached.includes(FORK_LINK_TEXT); press++) {
      await page.keyboard.press('Shift+Tab')
      await afterTimeouts()
      reached.push(await page.evaluate(() => document.activeElement?.textContent.slice(0, 40)))
    }
    assert.equal(reached.includes(FORK_LINK_TEXT), true, `Shift+Tab reached ${JSON.stringify(reached)}`)
  })
})

// Penpa's SweetAlert popups on the solve page take the page dialog's look (#379): the font, the panel's colours and the
// confirm button's, read as computed styles. Penpa+'s own page keeps SweetAlert's default look.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, animationsDone, openPenpa, openSolvePage, useBrowser, openSettings } from './page.mjs'

const browser = useBrowser()

const STYLE_PROPS = ['fontFamily', 'backgroundColor', 'color', 'borderRadius']

// Runs in the page. The computed values of a Penpa+ popup (the answer check's kind: a title, a text and a confirm button).
async function popupStyleInPage (props) {
  const read = (node, keys = props) => Object.fromEntries(keys.map((p) => [p, getComputedStyle(node)[p]]))
  Swal.fire({ title: 'Congratulations!', text: 'You solved it.', icon: 'success' })
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  // The popup's own animations and the button's box-shadow transition must be over before a value is read.
  await Promise.all(document.getAnimations().map((a) => a.finished))
  return {
    panel: read(document.querySelector('.swal2-popup')),
    title: read(document.querySelector('.swal2-title'), ['fontFamily']),
    text: read(document.querySelector('.swal2-html-container'), ['fontFamily']),
    button: read(document.querySelector('.swal2-confirm')),
    focused: read(document.querySelector('.swal2-confirm'), ['boxShadow'])
  }
}

// Runs in the page, with the Settings dialog open. The values of that dialog's panel, and of a brand button, which is what a dialog's main action is.
async function pageDialogStyleInPage (props) {
  const read = (node, keys = props) => Object.fromEntries(keys.map((p) => [p, getComputedStyle(node)[p]]))
  const dialog = document.querySelector('wa-dialog[label="Settings"]')
  const ok = document.createElement('wa-button')
  ok.variant = 'brand'
  ok.textContent = 'OK'
  dialog.append(ok)
  await ok.updateComplete
  return {
    panel: read(dialog.shadowRoot.querySelector('[part~="dialog"]')),
    button: read(ok.shadowRoot.querySelector('[part~="base"]'))
  }
}

describe('a Penpa+ popup', () => {
  for (const theme of ['light', 'dark']) {
    it(`on solve.html has the page dialog's font, colours and button, in the ${theme} theme`, async () => {
      const { context, page } = await openSolvePage(browser(), AKARI_SOLVE)
      try {
        await page.evaluate((t) => engine.setTheme(t), theme)
        await animationsDone(page)
        await openSettings(page)
        const want = await page.evaluate(pageDialogStyleInPage, STYLE_PROPS)
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
        const got = await page.evaluate(popupStyleInPage, STYLE_PROPS)
        assert.deepEqual(got.panel, want.panel)
        assert.deepEqual(got.button, want.button)
        assert.equal(got.title.fontFamily, want.panel.fontFamily)
        assert.equal(got.text.fontFamily, want.panel.fontFamily)
        assert.equal(got.focused.boxShadow, 'none', 'no SweetAlert purple ring on a focused button')
        // A keyboard focus gets the page's focus ring, as a wa-button's.
        await page.evaluate(() => document.querySelector('.swal2-confirm').blur())
        // After a key press the browser rings a script's focus as it does a keyboard's.
        await page.keyboard.press('Shift')
        await page.evaluate(() => document.querySelector('.swal2-confirm').focus())
        const ring = await page.evaluate(() => {
          const confirm = document.querySelector('.swal2-confirm')
          const { outlineStyle, outlineWidth, outlineColor } = getComputedStyle(confirm)
          const probe = Object.assign(document.createElement('div'), { style: 'color: var(--wa-color-focus)' })
          document.body.append(probe)
          const focusColor = getComputedStyle(probe).color
          probe.remove()
          return { focused: document.activeElement === confirm, outlineStyle, outlineWidth, outlineColor, focusColor }
        })
        assert.equal(ring.focused, true, 'the confirm button holds focus')
        assert.deepEqual([ring.outlineStyle, ring.outlineWidth, ring.outlineColor], ['solid', '3px', ring.focusColor])
      } finally {
        await context.close()
      }
    })
  }

  it("on index.html keeps SweetAlert's own look", async () => {
    const { context, page } = await openPenpa(browser())
    try {
      const got = await page.evaluate(popupStyleInPage, STYLE_PROPS)
      assert.equal(got.panel.backgroundColor, 'rgb(255, 255, 255)')
      assert.equal(got.button.backgroundColor, 'rgb(112, 102, 224)')
    } finally {
      await context.close()
    }
  })
})

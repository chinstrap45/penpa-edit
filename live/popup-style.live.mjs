// Penpa's SweetAlert popups on the solve page take the page dialog's look (#379): the font, the panel's colours and the
// confirm button's, read as computed styles. Penpa+'s own page keeps SweetAlert's default look.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openPenpa, openSolvePage, useBrowser } from './page.mjs'

const browser = useBrowser()

const PANEL_PROPS = ['fontFamily', 'backgroundColor', 'color', 'borderRadius']
const BUTTON_PROPS = ['fontFamily', 'backgroundColor', 'color', 'borderRadius']

// Runs in the page. The computed values of a Penpa popup (the answer check's kind: a title, a text and a confirm button).
async function popupStyleInPage ([panelProps, buttonProps]) {
  Swal.fire({ title: 'Congratulations!', text: 'You solved it.', icon: 'success' })
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const read = (node, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(node)[p]]))
  return {
    panel: read(document.querySelector('.swal2-popup'), panelProps),
    button: read(document.querySelector('.swal2-confirm'), buttonProps)
  }
}

// Runs in the page. The values of the page's own dialog: its panel, and a brand button, which is what a dialog's main action is.
async function pageDialogStyleInPage ([panelProps, buttonProps]) {
  const dialog = document.createElement('wa-dialog')
  dialog.label = 'Reference'
  const ok = document.createElement('wa-button')
  ok.slot = 'footer'
  ok.variant = 'brand'
  ok.textContent = 'OK'
  dialog.append(ok)
  document.body.append(dialog)
  await Promise.all([dialog.updateComplete, ok.updateComplete])
  const read = (node, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(node)[p]]))
  return {
    panel: read(dialog.shadowRoot.querySelector('[part~="dialog"]'), panelProps),
    button: read(ok.shadowRoot.querySelector('[part~="base"]'), buttonProps)
  }
}

describe('a Penpa popup', () => {
  for (const theme of ['light', 'dark']) {
    it(`on solve.html has the page dialog's font, colours and button, in the ${theme} theme`, async () => {
      const { context, page } = await openSolvePage(browser(), AKARI_SOLVE)
      try {
        await page.evaluate((t) => engine.setTheme(t), theme)
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
        const want = await page.evaluate(pageDialogStyleInPage, [PANEL_PROPS, BUTTON_PROPS])
        const got = await page.evaluate(popupStyleInPage, [PANEL_PROPS, BUTTON_PROPS])
        assert.deepEqual(got.panel, want.panel)
        assert.deepEqual(got.button, want.button)
      } finally {
        await context.close()
      }
    })
  }

  it("on index.html keeps SweetAlert's own look", async () => {
    const { context, page } = await openPenpa(browser())
    try {
      const got = await page.evaluate(popupStyleInPage, [PANEL_PROPS, BUTTON_PROPS])
      assert.equal(got.panel.backgroundColor, 'rgb(255, 255, 255)')
      assert.equal(got.button.backgroundColor, 'rgb(112, 102, 224)')
    } finally {
      await context.close()
    }
  })
})

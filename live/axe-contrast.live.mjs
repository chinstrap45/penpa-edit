// WCAG AA colour contrast on `solve.html` (#378), read by axe-core's `color-contrast` rule on the loaded page: with a puzzle
// loaded, with Settings open and with another dialog open, in each theme. A planted low-contrast colour must fail it, so a
// pass is a check that can fail.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { contrastHelpersInPage, groundOfInPage, makeNumberSolveLink, opacityOfInPage, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()
const AXE_SOURCE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

let numberLink
async function openIn (theme) {
  numberLink ??= await makeNumberSolveLink(browser())
  const opened = await openSolvePage(browser(), numberLink)
  await opened.page.addScriptTag({ path: AXE_SOURCE })
  await opened.page.addScriptTag({ content: `window.__helpers = ${contrastHelpersInPage}; window.__groundOf = ${groundOfInPage}; window.__opacityOf = ${opacityOfInPage}` })
  // The page's `body` is 0 high with `overflow: hidden`; axe counts the fixed desk inside it as clipped and skips all its text.
  await opened.page.addStyleTag({ content: 'body.engine-mounted { height: 100vh; }' })
  await opened.page.evaluate((t) => engine.setTheme(t), theme)
  await settle(() => opened.page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
  // The colours ease to the new theme's; axe reads them only once the easing is over.
  await opened.page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
  return opened
}

// WCAG AA: 4.5:1, or 3:1 for large text (24px, or 18.66px and bold).
const AA_TEXT = 4.5
const AA_LARGE_TEXT = 3

// Runs in the page: axe's colour-contrast violations as one line each, plus the text it could not judge and this measures
// instead. Axe cannot read the panel colour behind a dialog's slotted text (it sits in Web Awesome's shadow DOM), so it
// reports that text as `bgOverlap`; those nodes are measured through the flat tree. Other undecided nodes (a one-character
// glyph, a swatch's letter on its colour) stay unjudged here; `dark-theme.live.mjs` measures the swatches.
async function violationsInPage ({ aaText, aaLargeText }) {
  const { violations, incomplete } = await axe.run(document, { runOnly: ['color-contrast'], elementRef: true })
  const lines = violations.flatMap((v) => v.nodes.map((n) => {
    const data = n.any[0]?.data ?? {}
    return `${data.fgColor} on ${data.bgColor} = ${data.contrastRatio} (needs ${data.expectedContrastRatio}): ${n.target.join(' ')}`
  }))
  const { parse, over, ratio } = window.__helpers()
  const measured = incomplete.flatMap((i) => i.nodes).filter((n) => n.any[0]?.data?.messageKey === 'bgOverlap')
  for (const { element, target } of measured) {
    const style = getComputedStyle(element)
    const ground = window.__groundOf(element, parse, over)
    const fg = parse(style.color)
    fg[3] *= window.__opacityOf(element)
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
    const needed = large ? aaLargeText : aaText
    const got = ratio(over(fg, ground), ground)
    if (got < needed) lines.push(`${style.color} on rgb(${ground.slice(0, 3)}) = ${got.toFixed(2)} (needs ${needed}): ${target.join(' ')}`)
  }
  return { lines, measured: measured.length }
}

const contrastViolations = async (page) => (await page.evaluate(violationsInPage, { aaText: AA_TEXT, aaLargeText: AA_LARGE_TEXT })).lines

const closeDialogs = (page) => page.keyboard.press('Escape')

for (const theme of ['light', 'dark']) {
  describe(`WCAG AA contrast, ${theme} theme`, () => {
    it('holds with a puzzle loaded', async () => {
      const { page } = await openIn(theme)
      assert.deepEqual(await contrastViolations(page), [])
    })

    it('holds with Settings open', async () => {
      const { page } = await openIn(theme)
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor()
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
      assert.deepEqual(await contrastViolations(page), [])
      await closeDialogs(page)
    })

    it('holds with the Change size dialog open', async () => {
      const { page } = await openIn(theme)
      await page.getByRole('region', { name: 'Board' }).getByRole('button', { name: 'Change size' }).click()
      await page.getByRole('dialog', { name: 'Change size' }).waitFor()
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
      assert.deepEqual(await contrastViolations(page), [])
    })
  })
}

describe('the contrast check', () => {
  it('fails on a planted low-contrast colour', async () => {
    const { page } = await openIn('light')
    await page.addStyleTag({ content: '.ui-card, .ui-card * { color: #bbb !important; background: #fff !important; }' })
    const found = await contrastViolations(page)
    assert.ok(found.length > 0, 'a planted #bbb on white is reported')
  })

  it('fails on a planted low-contrast colour in the Settings dialog, which axe cannot judge itself', async () => {
    const { page } = await openIn('light')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
    await page.addStyleTag({ content: 'wa-dialog[open] legend { color: #ddd !important; }' })
    const found = await contrastViolations(page)
    assert.ok(found.some((line) => line.includes('legend')), `a planted #ddd legend is reported: ${JSON.stringify(found)}`)
  })
})
